/**
 * Durable Delhi DSR catalog for DE picker (MVP).
 *
 * Persistence: localStorage key `pwd_delhi_dsr_catalog_v1` holds imported
 * items + metadata (filename, importedAt). Survives refresh in the same browser.
 * Sample 328-item seed (pwdDelhiDsrSeed) is the fallback until an officer imports.
 *
 * Not a server/API upload — intentional for MVP so DE works offline and we avoid
 * a new backend module. Optional demo file lives under data/catalog/regions/.
 * Replace later with BOQ-adjacent / API upload without redesigning DE pick UI.
 */

import type { DSRItem } from './types';
import { PWD_DELHI_DSR_SEED, PWD_DELHI_DSR_SEED_COUNT } from './data/pwdDelhiDsrSeed';
import { parseDsrCatalogFile, type DsrParseResult } from './dsrCatalogParse';

export const DSR_CATALOG_STORAGE_KEY = 'pwd_delhi_dsr_catalog_v1';
export const DSR_CATALOG_CHANGE_EVENT = 'pwd-delhi-dsr-catalog-change';

export type DsrCatalogSourceKind = 'sample_seed' | 'imported';

export interface DsrCatalogMeta {
  source: DsrCatalogSourceKind;
  /** Original filename when imported; null for sample seed. */
  filename: string | null;
  /** ISO timestamp of import; null for sample seed. */
  importedAt: string | null;
  itemCount: number;
}

interface StoredCatalog {
  version: 1;
  meta: DsrCatalogMeta;
  items: DSRItem[];
}

const SAMPLE_META: DsrCatalogMeta = {
  source: 'sample_seed',
  filename: null,
  importedAt: null,
  itemCount: PWD_DELHI_DSR_SEED_COUNT,
};

function nowIso(): string {
  return new Date().toISOString();
}

function emitChange(meta: DsrCatalogMeta): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(DSR_CATALOG_CHANGE_EVENT, { detail: { meta } }),
  );
}

function isValidItem(raw: unknown): raw is DSRItem {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  return (
    typeof o.code === 'string' &&
    o.code.trim() !== '' &&
    typeof o.description === 'string' &&
    typeof o.unit === 'string' &&
    typeof o.rate === 'number' &&
    Number.isFinite(o.rate) &&
    typeof o.category === 'string'
  );
}

function readStored(): StoredCatalog | null {
  try {
    const raw = localStorage.getItem(DSR_CATALOG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCatalog;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.items)) return null;
    const items = parsed.items.filter(isValidItem);
    if (items.length === 0) return null;
    return {
      version: 1,
      meta: {
        source: 'imported',
        filename: parsed.meta?.filename ?? 'imported catalog',
        importedAt: parsed.meta?.importedAt ?? null,
        itemCount: items.length,
      },
      items,
    };
  } catch {
    return null;
  }
}

/** Active catalog: imported (localStorage) or sample seed. */
export function getActiveDsrCatalog(): readonly DSRItem[] {
  const stored = readStored();
  if (stored) return stored.items;
  return PWD_DELHI_DSR_SEED;
}

export function getDsrCatalogMeta(): DsrCatalogMeta {
  const stored = readStored();
  if (stored) return stored.meta;
  return { ...SAMPLE_META, itemCount: PWD_DELHI_DSR_SEED.length };
}

export function isUsingSampleDsrSeed(): boolean {
  return getDsrCatalogMeta().source === 'sample_seed';
}

/** Human banner for DE: source + date (or sample-seed label). */
export function formatDsrCatalogBanner(meta?: DsrCatalogMeta): string {
  const m = meta ?? getDsrCatalogMeta();
  if (m.source === 'sample_seed') {
    return `Sample CPWD/Delhi DSR seed (${m.itemCount} items) — replace with official PWD Delhi schedule when provided; not for tender award. Not an official GNCTD / PWD Delhi / CPWD publication.`;
  }
  const when = m.importedAt
    ? new Date(m.importedAt).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : 'unknown date';
  const file = m.filename || 'imported file';
  return `Imported DSR: ${file} · ${m.itemCount} items · imported ${when} — verify against official PWD Delhi schedule before tender use.`;
}

/** Persist imported catalog; replaces any previous import. */
export function saveImportedDsrCatalog(
  items: DSRItem[],
  filename: string,
): DsrCatalogMeta {
  if (!items.length) {
    throw new Error('Cannot save an empty DSR catalog.');
  }
  const meta: DsrCatalogMeta = {
    source: 'imported',
    filename: filename || 'imported catalog',
    importedAt: nowIso(),
    itemCount: items.length,
  };
  const payload: StoredCatalog = { version: 1, meta, items: [...items] };
  localStorage.setItem(DSR_CATALOG_STORAGE_KEY, JSON.stringify(payload));
  emitChange(meta);
  return meta;
}

/** Clear import and fall back to the 328-item sample seed. */
export function clearImportedDsrCatalog(): DsrCatalogMeta {
  try {
    localStorage.removeItem(DSR_CATALOG_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  const meta = { ...SAMPLE_META, itemCount: PWD_DELHI_DSR_SEED.length };
  emitChange(meta);
  return meta;
}

export interface ImportDsrFileResult {
  meta: DsrCatalogMeta;
  parse: DsrParseResult;
}

/** Parse file + persist. */
export async function importDsrCatalogFile(file: File): Promise<ImportDsrFileResult> {
  const parse = await parseDsrCatalogFile(file);
  const meta = saveImportedDsrCatalog(parse.items, file.name);
  return { meta, parse };
}

export function searchActiveDsr(
  query: string,
  category?: DSRItem['category'] | 'all',
  catalog?: readonly DSRItem[],
): DSRItem[] {
  const list = catalog ?? getActiveDsrCatalog();
  const q = query.trim().toLowerCase();
  return list.filter((item) => {
    if (category && category !== 'all' && item.category !== category) return false;
    if (!q) return true;
    return (
      item.code.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.unit.toLowerCase().includes(q)
    );
  });
}
