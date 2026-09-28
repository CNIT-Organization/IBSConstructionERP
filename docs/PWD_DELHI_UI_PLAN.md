# PWD Delhi — Works Estimating UI Plan (Planning & Engineers)

**Product face:** PWD Delhi — Works Estimating / लोक निर्माण विभाग — लागत अनुमान  
**Audience:** Planning wing + Engineer wing (not citizen Sewa)  
**Base:** CivilCore WIP on branch `feature/civilcore-pwd-delhi-wip`  
**DB:** SQLite local demo · PostgreSQL shared/staging

## Approach

1. **Plan UI first** (this doc) — screens, theme, nav allowlist, cleanup.
2. **Build shell + estimator together** — gov theme applied while PE/DE flows land (avoid restyling twice).
3. **Cleanup unused clutter** in the same Phase A PR family (safe deletes first; hide unused modules via demo profile before hard delete of backend modules).

## Visual language (government-simple)

| Token | Choice | Notes |
|-------|--------|-------|
| Background | `#F5F7FA` page / white cards | Flat, high contrast |
| Primary | Deep navy `#0B3A6E` | Headers, primary buttons |
| Accent | Saffron `#E87722` | Focus, step progress (demo-safe, not claimed official brand) |
| Success / warn / danger | Standard green / amber / red | Status chips only |
| Typography | System UI stack, 16px body | Large labels; Hindi + English |
| Density | Spacious forms, max ~3 actions per screen | No dense AG Grid by default on PE |
| Chrome | Top bar: Emblem + dept name · left nav short | No marketplace chrome |

## Screens to create / reshape

| # | Screen | Role | Notes |
|---|--------|------|-------|
| 1 | Login | All | Simple GNCTD-style card; demo accounts Planning / Engineer |
| 2 | Home / Dashboard | Both | Open estimates, pending T/S, AA status cards |
| 3 | Projects | Both | Delhi works list (building + road) |
| 4 | PE wizard | Planning | Plinth area → PAR → CI → contingency → Abstract |
| 5 | DE editor | Engineer | DSR item pick + qty; NS rate analysis drawer |
| 6 | Estimate register | Both | Stages: Rough → PE → AA/ES → DE → T/S → NIT |
| 7 | Sanction panel | Engineer / CE | T/S by power; AA/ES as status from admin |
| 8 | Exports | Both | Abstract of Cost, SOQ PDF/Excel |
| 9 | Settings (minimal) | Admin | Users, rate pack, Cost Index |

## Nav allowlist (show only)

Dashboard · Projects · Estimates (PE/DE) · Cost / DSR rates · Takeoff (optional) · Reports · Settings  

**Hide for demo:** AI, chat, advisor, regional exchanges except India, CRM, HSE deep modules, carbon, marketplace noise, logo experiments.

## Cleanup list (unused / clutter)

### Safe to remove from demo tree (Phase A)

- `frontend/logo-*.html`, `logo-showcase*.html` (design experiments)
- `frontend/login-variants/` if unused by routes
- `frontend/_screenshot_*.mjs`, `audit-wave*.mjs` (one-off audits) — keep if CI needs; else move to `tools/` or delete
- `website-marketing/` from **demo deploy** path (keep in repo or separate later)

### Hide via CivilCore/PWD demo profile (do not delete backend yet)

- AI / erp_chat / project_intelligence
- Non-India BOQ exchange plugins
- risk-analysis, cost-benchmark (unless wanted)
- Full commercial CRM / property_dev for first demo

### Keep

- `boq`, `costs`, `catalog`, `assemblies`, `india_pack`, `projects`, `takeoff`, `tendering`, `reporting`, `validation`
- `docs/CLEANUP_AUDIT.md` as history

## Build order after push

1. Theme tokens + login + shell nav allowlist  
2. Estimate register + PE wizard  
3. DE + DSR pick + exports  
4. Demo seeds (Delhi building + road)  
5. Postgres path documented alongside SQLite  

## Push status

Local commit on `feature/civilcore-pwd-delhi-wip`. Remote push needs GitHub credentials on the Mac (`gh auth login` or HTTPS credential).
