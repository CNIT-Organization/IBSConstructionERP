# PWD Delhi DSR catalog import (MVP)

## Seed
- `PWD_DELHI_DSR_seed.csv` — 328-item sample CPWD/Delhi DSR seed (also mirrored under
  `frontend/src/features/estimates/data/`). Used by the DE picker until an officer imports a file.

## Import (DE page)
1. Open Detailed Estimate as **Engineer** (demo wing role).
2. Click **Import DSR (CSV / Excel)**.
3. Choose a file with header columns: `code`, `description`, `unit`, `rate`, `category`
   (aliases accepted case-insensitively).
4. Banner updates to **Imported schedule** with filename + imported-at.
5. Catalog is stored in **browser localStorage** key `pwd_delhi_dsr_catalog_v1` (survives refresh).
6. **Restore sample seed** clears the import and falls back to the 328-item seed.

## Formats
- **CSV** and **Excel `.xlsx`** supported (exceljs).
- Legacy **`.xls`**: convert to `.xlsx` or CSV first (exceljs does not read BIFF).

## Persistence note
MVP is client-side only (no new API upload). Official schedule files can later be stored
server-side / BOQ-adjacent without redesigning the DE picker UI.
