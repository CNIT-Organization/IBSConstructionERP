"""‌⁠‍Serve frontend static files from the installed package or dev build.

When running via `openestimate serve` or with SERVE_FRONTEND=true,
the FastAPI app serves the pre-built React frontend directly — no Nginx needed.

Frontend is found in two locations (checked in order):
1. app/_frontend_dist/ — bundled inside the Python wheel (pip install)
2. ../frontend/dist/   — development mode (repo checkout)
"""

import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.requests import Request
from starlette.responses import FileResponse, Response

logger = logging.getLogger(__name__)


def get_frontend_dir() -> Path:
    """‌⁠‍Find the bundled frontend dist directory.

    Returns:
        Path to the directory containing index.html and assets/.

    Raises:
        FileNotFoundError: If no frontend build is found.
    """
    # Option 1: installed as package (pip install openestimate)
    pkg_dir = Path(__file__).parent / "_frontend_dist"
    if pkg_dir.is_dir() and (pkg_dir / "index.html").exists():
        return pkg_dir

    # Option 2: development — frontend/dist relative to repo root
    repo_root = Path(__file__).resolve().parent.parent.parent  # backend/app/../../
    dev_dist = repo_root / "frontend" / "dist"
    if dev_dist.is_dir() and (dev_dist / "index.html").exists():
        return dev_dist

    raise FileNotFoundError(
        "Frontend dist not found. Run 'npm run build' in frontend/ or install the openestimate wheel."
    )


def mount_frontend(app: FastAPI) -> None:
    """‌⁠‍Mount frontend static files on the FastAPI app.

    Serves:
    - /assets/* — hashed JS/CSS bundles (long cache)
    - /favicon.svg, /logo.svg — static resources
    - /* (catch-all via 404 handler) — index.html for SPA routing

    Strategy: instead of a ``/{path:path}`` catch-all route (which competes
    with FastAPI's built-in ``/api/docs``, ``/api/redoc``, and
    ``/api/openapi.json``), we override the **404 exception handler**.
    This guarantees that all real API routes — including Swagger UI — are
    resolved first by FastAPI's normal router.  Only genuinely unmatched
    paths fall through to the 404 handler, which serves ``index.html``
    for non-API paths (SPA client-side routing).
    """
    try:
        frontend_dir = get_frontend_dir()
    except FileNotFoundError:
        logger.warning("Frontend dist not found — serving API only")
        return

    logger.info("Serving frontend from %s", frontend_dir)

    # Serve hashed assets (JS, CSS) with year-long immutable caching.
    # Vite emits content-hash suffixes (e.g. index-9MyhyuSS.js) so the
    # URL changes whenever the file changes — repeat visits can serve
    # straight from the browser cache without revalidation.
    class _ImmutableStaticFiles(StaticFiles):
        async def get_response(self, path: str, scope):  # noqa: ANN001, ANN202
            response = await super().get_response(path, scope)
            if response.status_code == 200:
                response.headers["Cache-Control"] = (
                    "public, max-age=31536000, immutable"
                )
            return response

    assets_dir = frontend_dir / "assets"
    if assets_dir.is_dir():
        app.mount(
            "/assets",
            _ImmutableStaticFiles(directory=str(assets_dir)),
            name="frontend-assets",
        )

    # Serve individual static files at the root (favicon, logo, etc.)
    index_path = frontend_dir / "index.html"

    for static_name in ("favicon.svg", "logo.svg"):
        static_path = frontend_dir / static_name
        if static_path.exists():
            # Use a factory to capture the correct path in the closure
            def _make_static_handler(fpath: Path):  # noqa: ANN202
                async def _handler():  # noqa: ANN202
                    return FileResponse(str(fpath))

                return _handler

            app.get(f"/{static_name}", include_in_schema=False)(_make_static_handler(static_path))

    # Serve other root-level static files (e.g. manifest.json, robots.txt)
    # that may exist in the frontend dist directory.
    _root_static_extensions = {
        ".ico", ".png", ".svg", ".webmanifest", ".json", ".txt", ".xml",
        ".webp", ".avif", ".jpg", ".jpeg", ".gif", ".woff", ".woff2",
    }

    # ── SPA fallback via custom 404 handler ─────────────────────────────
    # Keep a reference to whatever 404 handler was already registered
    # (e.g. FastAPI's default) so we can delegate API 404s to it.
    from fastapi.exception_handlers import http_exception_handler
    from starlette.exceptions import HTTPException as StarletteHTTPException

    @app.exception_handler(404)
    async def _spa_or_404(request: Request, exc: StarletteHTTPException) -> Response:
        """Serve index.html for frontend routes; real 404 for API paths.

        This replaces the previous ``/{path:path}`` catch-all route which
        could shadow FastAPI's built-in ``/api/docs`` and ``/api/redoc``.
        """
        path = request.url.path

        # API paths: return the normal JSON 404 response.
        if path.startswith("/api"):
            return await http_exception_handler(request, exc)

        # Check if the requested file physically exists in the frontend
        # dist (e.g. /robots.txt, /manifest.json).  Serve it directly
        # if it does, to avoid breaking non-HTML static assets.
        relative = path.lstrip("/")
        if relative:
            candidate = frontend_dir / relative
            if candidate.is_file() and candidate.suffix in _root_static_extensions:
                return FileResponse(str(candidate))

        # Everything else: SPA client-side routing → index.html. Force
        # the browser to revalidate the entry on every reload — a stale
        # cached index.html points at hashed asset URLs that may have
        # been deleted by a redeploy.
        return FileResponse(
            str(index_path),
            headers={"Cache-Control": "no-cache"},
        )
