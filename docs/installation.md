# CivilCore — Installation

Two supported paths: **local development** (PostgreSQL on the host) and **Docker quickstart** (evaluators / server trial).

## Prerequisites

| Component | Local dev | Docker quickstart |
|-----------|-----------|-------------------|
| Python | 3.12+ (3.13 recommended; 3.14 may work) | Included in image |
| Node.js | 20+ | Included in image |
| PostgreSQL | 16+ (Homebrew or native) | Provided by compose |
| Docker | Optional | **Required** |

## Local development (recommended for engineers)

```bash
git clone <repo-url> IBSConstructionERP
cd IBSConstructionERP

# One-time: Postgres role oe / DB openestimate, venv, migrations bootstrap
./scripts/setup-local.sh

# Daily: API :8000 + Vite :5173
./scripts/run-dev.sh
```

- **UI:** http://127.0.0.1:5173  
- **API:** http://127.0.0.1:8000/api/health  
- **Config:** `backend/.env` (gitignored), generated/updated by `setup-local.sh`  
- **Data:** `.local-data/` (vectors, optional Qdrant files)

`setup-local.sh` sets `CIVILCORE_DEMO=true` and creates/updates repo root `.env` with `VITE_CIVILCORE_DEMO=true` and `VITE_APP_NAME=CivilCore`.

### PostgreSQL (Homebrew example)

```bash
brew services start postgresql@18
pg_isready -h localhost -p 5432
```

### Without Docker

Infra services (Redis, MinIO, Qdrant) are **optional** for Phase 1 demo. Storage defaults to **local** filesystem (`STORAGE_BACKEND=local`).

## Docker quickstart (demo / staging)

```bash
cp .env.example .env
# Optional for CivilCore branding in unified build:
# CIVILCORE_DEMO=true
docker compose -f docker-compose.quickstart.yml up --build
```

- **URL:** http://localhost:8080  
- **Database:** PostgreSQL volume inside compose  
- **Migrations / schema:** created on first API startup (`create_all`)

For full infra (Postgres + Redis + MinIO + Qdrant + workers), see root `docker-compose.yml` — not required for first CivilCore walkthrough.

## Environment variables (summary)

Copy from `.env.example`. Important groups:

| Group | Examples |
|-------|----------|
| Application | `APP_ENV`, `ALLOWED_ORIGINS`, **`CIVILCORE_DEMO`** |
| Frontend (root `.env`) | **`VITE_CIVILCORE_DEMO`**, **`VITE_APP_NAME=CivilCore`** |
| Database | `DATABASE_URL`, `DATABASE_SYNC_URL` |
| Auth | `JWT_SECRET`, `DEMO_USER_PASSWORD` |
| Storage | `STORAGE_BACKEND=local` or S3/MinIO |
| AI (optional) | Provider API keys — **not required** for BOQ calculations |

Never commit secrets. Use `backend/.env` and root `.env` locally only.

## Verify installation

```bash
curl -s http://127.0.0.1:8000/api/health | python3 -m json.tool
# Expect: status healthy, civilcore_demo true/false, modules_loaded ~88
```

Login: `demo@openestimator.io` / `DemoPass1234!`

## Troubleshooting

| Issue | Action |
|-------|--------|
| CWICR 404 on GitHub | Fixed in tree: downloads use Hugging Face first (`costs/router.py`). |
| “Unable to connect” on login | Use **:5173** for Vite dev; ensure backend **:8000** is running. |
| BIM converters 0/4 on Mac | Expected — see [demo.md](./demo.md). |
| Demo users missing | Restart backend once; check PostgreSQL and `SEED_DEMO` not false. |

## Linux

See [INSTALL_LINUX.md](./INSTALL_LINUX.md) for pip/venv paths.
