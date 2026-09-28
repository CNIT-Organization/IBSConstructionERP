# CivilCore demo seed plan (Phase 1 Step 4)

This document defines **target** demo project names and regions for Step 4+ seed work.  
**Current auto-seed IDs are unchanged** until a dedicated seed migration (see `backend/app/core/demo_projects.py` comment block).

## Goals

- **India + Global** evaluators see familiar project types (roads, infrastructure, commercial, institutional).
- **Construction + roads/infrastructure** BOQ themes (earthwork, pavement, drainage, bridges).
- Keep existing `demo_id` slugs stable where possible, or add parallel templates before switching `DEFAULT_DEMO_IDS`.

## Target five demo projects (CivilCore)

| Priority | Target `demo_id` (new or rename) | Display name | Region / currency | Theme |
|----------|-----------------------------------|--------------|-------------------|--------|
| 1 | `highway-nh48-karnataka` | NH-48 Four-Lane Upgrade (Karnataka) | IN / INR | Road rehabilitation, earthwork & pavement |
| 2 | `metro-station-delhi` | Metro Station Box (Delhi) | IN / INR | Commercial / infrastructure (CPWD/PWD classifications via `india_pack`) |
| 3 | `bridge-replacement-i95` | I-95 Highway Bridge Replacement | US / USD | Road + bridge, MasterFormat |
| 4 | `airport-taxiway-dxb` | Airport Taxiway & Pavement (Global/GCC) | AE or GLOBAL / USD or AED | Pavement / drainage |
| 5 | `school-complex-global` | Institutional School Complex | GLOBAL / metric / EN | Residential-scale building (institutional) |

## Mapping from current auto-seed (reference only)

| Current `DEFAULT_DEMO_IDS` entry | Suggested CivilCore replacement |
|----------------------------------|--------------------------------|
| `residential-berlin` | `highway-nh48-karnataka` |
| `warehouse-dubai` | `airport-taxiway-dxb` or retain industrial infra |
| `school-paris` | `school-complex-global` |
| `medical-us` | `bridge-replacement-i95` |
| (optional 5th) `office-london` in catalog | `metro-station-delhi` |

## User-facing labels (shorter demo list)

For marketing copy and login/demo banners, use:

1. **Road Rehabilitation** — NH upgrade / highway widening  
2. **Commercial Office / Station** — metro box or commercial shell  
3. **Residential / Institutional** — school or housing complex  
4. **Drainage / Infrastructure** — stormwater, culverts, airfield drainage sections in BOQ  
5. **Global bridge / US highway** — bridge superstructure & substructure

## CWICR / regional hooks (Step 6–7)

| Project | Suggested CWICR `db_id` / pack |
|---------|--------------------------------|
| India road & metro | India region catalogue; enable `in-boq-exchange` when `project.region` ∈ IN* |
| US bridge | US MasterFormat catalogue; `us-masterformat-exchange` plugin |
| Global school | Metric EN locale; neutral GLOBAL or EU fallback until user picks region |

## PWD Delhi DSR (config layer — not in seed Python)

- Add rate-pack reference under `data/catalog/regions/` and `oe_india_pack` config (Step 6).
- Do **not** embed Delhi rates in `oe_boq` core.

## Implementation checklist (next coding step)

- [ ] Clone or rename templates in `demo_projects.py` (preserve install API slugs during transition).
- [ ] Set explicit `region`, `currency`, `locale` on seeded `Project` rows (override DACH defaults).
- [ ] Add road BOQ sections (earthwork, pavement, drainage) using existing CWICR highway/rail vocabulary.
- [ ] Smoke-test fresh install: `DEFAULT_DEMO_IDS` length ≤ 5, demo users not rolled back on seed failure (`main.py`).
- [ ] Update demo banner / settings import copy to CivilCore project names.

## Docker quickstart (Step 5)

Document `CIVILCORE_DEMO=true` and `VITE_APP_NAME=CivilCore` in quickstart `.env` when building the unified image so evaluators get hidden AI nav without manual toggles.
