# CivilCore — Demo guide

Product positioning: **Construction Management, Planning & Cost Estimation** (India + global).  
Phase 1 uses the **CivilCore demo profile** — AI navigation hidden; construction and infrastructure workflows emphasized.

## Demo login

| Role | Email | Password |
|------|--------|----------|
| Admin | `demo@openestimator.io` | `DemoPass1234!` |

(Estimator / Manager: same password pattern — see onboarding or `DEMO_*_PASSWORD` in `.env`.)

## Enable CivilCore demo mode

**Backend** (`backend/.env`):

```env
CIVILCORE_DEMO=true
```

**Frontend dev** (repo root `.env`, read by Vite):

```env
CIVILCORE_DEMO=true
VITE_CIVILCORE_DEMO=true
VITE_APP_NAME=CivilCore
```

Restart `./scripts/run-dev.sh` after changing env. The UI also reads `civilcore_demo` from `GET /api/health` once the API is up.

**Branding:** Defaults are **CivilCore** (logo, favicon, sidebar, login, English strings) even without `.env`. Optional overrides:

```env
VITE_APP_GITHUB=https://github.com/CNIT-Organization/IBSConstructionERP
VITE_APP_TAGLINE=Construction cost estimation & project control
```

Hard-refresh the browser (`Cmd+Shift+R`) after a Vite restart so the new favicon and bundle load.

When demo mode is on:

- AI menu items (AI estimate, advisor, chat) are hidden — routes still exist if opened by URL.
- Onboarding defaults to the **civil contractor** preset (construction + roads module set).

## Refresh demo projects (existing database)

If you seeded **before** the CivilCore rename, project titles may still show Berlin/Dubai/Paris names. Metadata in code is updated; the DB is not rewritten automatically.

**Option A — force reinstall one demo** (logged in as admin, with API token):

```bash
# Example: refresh India road demo (internal key residential-berlin)
curl -X POST "http://127.0.0.1:8000/api/demo/install/residential-berlin?force=true" \
  -H "Authorization: Bearer <access_token>"
```

Other auto-seeded keys: `warehouse-dubai`, `office-london`, `medical-us`. See `GET /api/demo/status`.

**Option B — fresh database** (dev only): drop/recreate `openestimate` in PostgreSQL and restart the backend so startup seed runs again.

## Recommended demo path (15–20 min)

1. Login → Dashboard  
2. **Projects** → open a demo project (or create one: set **region/currency** for India vs global)  
3. **Costs** → load regional CWICR (e.g. `HI_MUMBAI` for India — requires network to Hugging Face)  
4. **BOQ** → add lines, quantities, rates  
5. **Takeoff** / **DWG takeoff** (PDF/DWG as available)  
6. **Schedule** / **5D** (if seeded)  
7. **Reporting** → export PDF/Excel  

## Platform notes

| Topic | Note |
|--------|------|
| **macOS** | DDC RVT/DWG/DGN **Install** buttons do not auto-install; use **IFC** upload or Windows/Linux for full CAD conversion. |
| **AI** | Hidden in demo profile; core BOQ math does not require an LLM. |
| **India / PWD Delhi** | CWICR + regional packs are configurable layers — see `docs/demo-seed-plan.md` and `oe_india_pack`. |
| **Region switch** | Per **project** settings (region, currency, locale) — not hard-coded to India in core code. |

## Docker quickstart (evaluators)

```bash
cd IBSConstructionERP
cp .env.example .env
# Set CIVILCORE_DEMO=true in .env before build if using custom compose env
docker compose -f docker-compose.quickstart.yml up --build
```

Open **http://localhost:8080** (single container; not Vite `:5173`).

## Local developer setup

See [installation.md](./installation.md).

## Further reading

- [CLEANUP_AUDIT.md](./CLEANUP_AUDIT.md) — module inventory and Phase 1 plan  
- [demo-seed-plan.md](./demo-seed-plan.md) — target India/global demo project names  
