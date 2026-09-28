/**
 * Parse Delhi DSR catalog from CSV or Excel (.xlsx / best-effort .xls).
 * Required columns (header row): code, description, unit, rate, category.
 * Common aliases mapped case-insensitively.
 *
 * Excel: exceljs reads .xlsx reliably. Legacy .xls (BIFF) is not supported by
 * exceljs — callers should convert to .xlsx (or CSV) first; we surface a clear error.
 */

import type { DSRItem } from './types';

export type DsrCategory = DSRItem['category'];

export const DSR_CATEGORIES: readonly DsrCategory[] = [
  'earthwork',
  'concrete',
  'masonry',
  'steel',
  'finishing',
  'road',
  'misc',
] as const;

export interface DsrParseResult {
  items: DSRItem[];
  warnings: string[];
  sheetOrFormat: string;
}

const CODE_ALIASES = [
  'code',
  'item_code',
  'itemcode',
  'dsr_code',
  'sor_code',
  'item no',
  'item_no',
  'itemno',
  'item number',
  'sr_no',
  's.no',
  'sno',
];
const DESC_ALIASES = [
  'description',
  'desc',
  'item_description',
  'item description',
  'particulars',
  'particular',
  'name',
  'item',
  'details',
];
const UNIT_ALIASES = ['unit', 'uom', 'unit_of_measure', 'unit of measure', 'units'];
const RATE_ALIASES = [
  'rate',
  'unit_rate',
  'unit rate',
  'rate_inr',
  'rate (inr)',
  'amount',
  'price',
  'rate_rs',
  'rs',
];
const CAT_ALIASES = [
  'category',
  'cat',
  'chapter',
  'head',
  'work_type',
  'work type',
  'group',
];

const CATEGORY_SYNONYMS: Record<string, DsrCategory> = {
  earthwork: 'earthwork',
  earth: 'earthwork',
  excavation: 'earthwork',
  'earth work': 'earthwork',
  concrete: 'concrete',
  cc: 'concrete',
  rcc: 'concrete',
  pcc: 'concrete',
  masonry: 'masonry',
  brick: 'masonry',
  brickwork: 'masonry',
  stone: 'masonry',
  steel: 'steel',
  reinforcement: 'steel',
  rebar: 'steel',
  finishing: 'finishing',
  finish: 'finishing',
  paint: 'finishing',
  plaster: 'finishing',
  flooring: 'finishing',
  road: 'road',
  pavement: 'road',
  bitumen: 'road',
  misc: 'misc',
  miscellaneous: 'misc',
  other: 'misc',
  others: 'misc',
};

function normHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[\uFEFF]/g, '')
    .replace(/[_/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findCol(headers: string[], aliases: string[]): number {
  const normalized = headers.map(normHeader);
  for (const alias of aliases) {
    const a = normHeader(alias);
    const idx = normalized.indexOf(a);
    if (idx >= 0) return idx;
  }
  // soft contains match
  for (let i = 0; i < normalized.length; i++) {
    const h = normalized[i]!;
    for (const alias of aliases) {
      const a = normHeader(alias);
      if (h === a || h.includes(a) || a.includes(h)) return i;
    }
  }
  return -1;
}

export function normalizeCategory(raw: string | undefined | null): DsrCategory {
  if (!raw) return 'misc';
  const key = raw.trim().toLowerCase();
  if (!key) return 'misc';
  if ((DSR_CATEGORIES as readonly string[]).includes(key)) return key as DsrCategory;
  if (key in CATEGORY_SYNONYMS) return CATEGORY_SYNONYMS[key]!;
  for (const [syn, cat] of Object.entries(CATEGORY_SYNONYMS)) {
    if (key.includes(syn)) return cat;
  }
  return 'misc';
}

function parseRate(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (raw == null) return null;
  const s = String(raw)
    .trim()
    .replace(/[₹,\s]/g, '')
    .replace(/rs\.?/i, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Minimal RFC4180-ish CSV split that keeps quoted commas. */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (ch === '\n') {
      row.push(cell);
      cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
      continue;
    }
    if (ch === '\r') continue;
    cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

function rowsToItems(
  rows: string[][],
  warnings: string[],
): DSRItem[] {
  if (rows.length === 0) {
    throw new Error('File has no data rows.');
  }
  // Skip leading comment / banner lines that are not headers
  let headerIdx = 0;
  while (headerIdx < rows.length) {
    const cells = rows[headerIdx]!.map((c) => normHeader(c));
    const joined = cells.join('|');
    const looksLikeHeader =
      findCol(cells, CODE_ALIASES) >= 0 &&
      (findCol(cells, DESC_ALIASES) >= 0 || findCol(cells, RATE_ALIASES) >= 0);
    if (looksLikeHeader) break;
    // single-cell comment lines (seed CSV starts with # …)
    if (rows[headerIdx]!.length === 1 && joined.startsWith('#')) {
      headerIdx++;
      continue;
    }
    if (joined.includes('code') && joined.includes('description')) break;
    headerIdx++;
  }
  if (headerIdx >= rows.length) {
    throw new Error(
      'Could not find a header row with code / description / unit / rate / category.',
    );
  }

  const headers = rows[headerIdx]!.map((h) => h.trim());
  const codeCol = findCol(headers, CODE_ALIASES);
  const descCol = findCol(headers, DESC_ALIASES);
  const unitCol = findCol(headers, UNIT_ALIASES);
  const rateCol = findCol(headers, RATE_ALIASES);
  const catCol = findCol(headers, CAT_ALIASES);

  if (codeCol < 0 || descCol < 0 || unitCol < 0 || rateCol < 0) {
    throw new Error(
      `Missing required columns. Found headers: ${headers.join(', ') || '(none)'}. Need code, description, unit, rate (category optional → misc).`,
    );
  }
  if (catCol < 0) {
    warnings.push('No category column — defaulting all rows to "misc".');
  }

  const items: DSRItem[] = [];
  const seen = new Set<string>();
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const cells = rows[r]!;
    const code = String(cells[codeCol] ?? '').trim();
    if (!code || code.startsWith('#')) continue;
    const description = String(cells[descCol] ?? '').trim();
    const unit = String(cells[unitCol] ?? '').trim() || 'nos';
    const rate = parseRate(cells[rateCol]);
    if (!description) {
      warnings.push(`Row ${r + 1}: skipped (empty description) code=${code}`);
      continue;
    }
    if (rate == null) {
      warnings.push(`Row ${r + 1}: skipped (invalid rate) code=${code}`);
      continue;
    }
    const category = normalizeCategory(catCol >= 0 ? cells[catCol] : 'misc');
    if (seen.has(code)) {
      warnings.push(`Duplicate code "${code}" — keeping last occurrence.`);
    }
    seen.add(code);
    // replace prior duplicate
    const existing = items.findIndex((it) => it.code === code);
    const item: DSRItem = { code, description, unit, rate, category };
    if (existing >= 0) items[existing] = item;
    else items.push(item);
  }

  if (items.length === 0) {
    throw new Error('No valid DSR rows found after parsing.');
  }
  return items;
}

export function parseDsrCsvText(text: string): DsrParseResult {
  const warnings: string[] = [];
  const rows = parseCsvText(text);
  const items = rowsToItems(rows, warnings);
  return { items, warnings, sheetOrFormat: 'csv' };
}

function cellToString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value !== null && 'text' in value) {
    return String((value as { text: unknown }).text ?? '');
  }
  if (typeof value === 'object' && value !== null && 'result' in value) {
    return String((value as { result: unknown }).result ?? '');
  }
  return String(value);
}

export async function parseDsrExcelBuffer(
  buffer: ArrayBuffer | Uint8Array,
  filename: string,
): Promise<DsrParseResult> {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.xls') && !lower.endsWith('.xlsx')) {
    throw new Error(
      'Legacy .xls (BIFF) is not supported. Save as .xlsx or CSV and import again.',
    );
  }

  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  // Normalize for Node Buffer / browser ArrayBuffer / Uint8Array (jszip-safe).
  const data: Uint8Array =
    typeof Buffer !== 'undefined' && Buffer.isBuffer(buffer)
      ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
      : buffer instanceof Uint8Array
        ? buffer
        : new Uint8Array(buffer);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(data as any);

  const sheet = wb.worksheets[0];
  if (!sheet) {
    throw new Error('Excel workbook has no sheets.');
  }

  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as unknown[];
    // ExcelJS row.values is 1-indexed (index 0 unused)
    const cells: string[] = [];
    const max = Math.max(values.length - 1, row.cellCount);
    for (let c = 1; c <= max; c++) {
      cells.push(cellToString(values[c]));
    }
    if (cells.some((c) => c.trim() !== '')) rows.push(cells);
  });

  const warnings: string[] = [];
  const items = rowsToItems(rows, warnings);
  return { items, warnings, sheetOrFormat: sheet.name || 'Sheet1' };
}

export async function parseDsrCatalogFile(file: File): Promise<DsrParseResult> {
  const name = file.name || 'catalog';
  const lower = name.toLowerCase();
  if (lower.endsWith('.csv') || file.type === 'text/csv') {
    const text = await file.text();
    return parseDsrCsvText(text);
  }
  if (
    lower.endsWith('.xlsx') ||
    lower.endsWith('.xls') ||
    file.type.includes('spreadsheet') ||
    file.type.includes('excel')
  ) {
    const buffer = await file.arrayBuffer();
    return parseDsrExcelBuffer(buffer, name);
  }
  // Try CSV first by content, then excel
  const text = await file.text();
  if (text.includes(',') && /code/i.test(text.slice(0, 500))) {
    return parseDsrCsvText(text);
  }
  throw new Error(
    `Unsupported file type "${name}". Use CSV or Excel (.xlsx). Legacy .xls: convert to .xlsx first.`,
  );
}
