import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDsrCsvText, parseDsrExcelBuffer, normalizeCategory } from '../dsrCatalogParse';

describe('dsrCatalogParse', () => {
  it('parses CSV with required columns', () => {
    const text = readFileSync('/tmp/dsr-smoke/test_import.csv', 'utf8');
    const r = parseDsrCsvText(text);
    expect(r.items).toHaveLength(2);
    expect(r.items[0]!.code).toBe('SMOKE.1');
    expect(r.items[0]!.rate).toBe(111.5);
    expect(r.items[1]!.category).toBe('concrete');
  });

  it('maps common header aliases', () => {
    const text = readFileSync('/tmp/dsr-smoke/test_alias.csv', 'utf8');
    const r = parseDsrCsvText(text);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]!.code).toBe('ALIAS.9');
    expect(r.items[0]!.category).toBe('road');
  });

  it('parses seed CSV banner + header', () => {
    const seedPath = resolve(__dirname, '../data/PWD_DELHI_DSR_seed.csv');
    const text = readFileSync(seedPath, 'utf8');
    const r = parseDsrCsvText(text);
    expect(r.items.length).toBeGreaterThanOrEqual(300);
    expect(r.items.some((i) => i.code === '2.1')).toBe(true);
  });

  it('parses xlsx via exceljs', async () => {
    const buf = readFileSync('/tmp/dsr-smoke/test_import.xlsx');
    const r = await parseDsrExcelBuffer(buf, 'test_import.xlsx');
    expect(r.items).toHaveLength(2);
    expect(r.items[0]!.code).toBe('XL.1');
  });

  it('rejects legacy .xls with clear message', async () => {
    await expect(
      parseDsrExcelBuffer(new Uint8Array(8), 'old.xls'),
    ).rejects.toThrow(/Legacy \.xls/);
  });

  it('normalizes category synonyms', () => {
    expect(normalizeCategory('Brickwork')).toBe('masonry');
    expect(normalizeCategory('RCC')).toBe('concrete');
    expect(normalizeCategory('')).toBe('misc');
  });
});
