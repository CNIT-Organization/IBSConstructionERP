/**
 * PWD Delhi / CPWD-style DSR catalog for DE editor.
 * Default: Sample CPWD/Delhi DSR seed (328 items) — see data/PWD_DELHI_DSR_seed.csv.
 * Officers can import CSV / Excel (.xlsx) via DE page; import persists in localStorage
 * (`pwd_delhi_dsr_catalog_v1`) until cleared. Replace with official PWD Delhi schedule
 * when provided — not for tender award.
 */

import type { DSRItem } from './types';
import { PWD_DELHI_DSR_SEED, PWD_DELHI_DSR_SEED_COUNT } from './data/pwdDelhiDsrSeed';
import {
  formatDsrCatalogBanner,
  getActiveDsrCatalog,
  getDsrCatalogMeta,
  searchActiveDsr,
} from './dsrCatalogStore';

/** Static sample-seed banner (fallback label). Prefer getDsrCatalogBanner(). */
export const DSR_CATALOG_BANNER = formatDsrCatalogBanner({
  source: 'sample_seed',
  filename: null,
  importedAt: null,
  itemCount: PWD_DELHI_DSR_SEED_COUNT,
});

/** @deprecated Prefer DSR_CATALOG_BANNER — kept for callers that still import DEMO_DSR_BANNER. */
export const DEMO_DSR_BANNER = DSR_CATALOG_BANNER;

/**
 * Sample seed catalog (always the 328-item fallback).
 * For the live DE picker (seed or imported), use getActiveDsrCatalog().
 */
export const DSR_CATALOG: readonly DSRItem[] = PWD_DELHI_DSR_SEED;

export const DSR_CATALOG_COUNT = PWD_DELHI_DSR_SEED_COUNT;

/** @deprecated Prefer DSR_CATALOG — alias kept for estimateStore / index exports. */
export const DEMO_DSR_CATALOG = DSR_CATALOG;

/** Live catalog used by DE pick (imported override or sample seed). */
export { getActiveDsrCatalog, getDsrCatalogMeta, formatDsrCatalogBanner };

export function getDsrCatalogBanner(): string {
  return formatDsrCatalogBanner(getDsrCatalogMeta());
}

export function searchDSR(
  query: string,
  category?: DSRItem['category'] | 'all',
): DSRItem[] {
  return searchActiveDsr(query, category);
}

/** @deprecated Prefer searchDSR — alias kept for DEEditorPage. */
export function searchDemoDSR(
  query: string,
  category?: DSRItem['category'] | 'all',
): DSRItem[] {
  return searchDSR(query, category);
}
