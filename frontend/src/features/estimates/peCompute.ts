/**
 * Client-side PE Abstract of Cost computation.
 * Formula: plinthArea × PAR × costIndexFactor, then + contingency%.
 * GST 18% shown as informational line for works contracts.
 */

import {
  GST_WORKS_PCT,
  type AbstractOfCost,
  type PEWizardState,
} from './types';

export function computeAbstract(state: Pick<
  PEWizardState,
  'plinthAreaSqm' | 'parRate' | 'costIndexFactor' | 'contingencyPct'
>): AbstractOfCost {
  const plinthAreaSqm = Math.max(0, Number(state.plinthAreaSqm) || 0);
  const parRate = Math.max(0, Number(state.parRate) || 0);
  const costIndexFactor = Math.max(0, Number(state.costIndexFactor) || 0);
  const contingencyPct = Math.max(0, Number(state.contingencyPct) || 0);

  const baseCost = plinthAreaSqm * parRate;
  const indexedCost = baseCost * costIndexFactor;
  const contingencyAmount = indexedCost * (contingencyPct / 100);
  const estimatedCost = indexedCost + contingencyAmount;
  const gstPct = GST_WORKS_PCT;
  const gstAmount = estimatedCost * (gstPct / 100);
  const totalWithGstInfo = estimatedCost + gstAmount;

  return {
    plinthAreaSqm,
    parRate,
    costIndexFactor,
    baseCost,
    indexedCost,
    contingencyPct,
    contingencyAmount,
    estimatedCost,
    gstPct,
    gstAmount,
    totalWithGstInfo,
  };
}

/** Indian Rupee formatting for register / abstract. */
export function formatInr(amount: number): string {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount || 0);
  } catch {
    return `₹${Math.round(amount || 0).toLocaleString('en-IN')}`;
  }
}

/** Demo PAR options (CWICR / DSR-style placeholders for Delhi building works). */
export const DEMO_PAR_OPTIONS: ReadonlyArray<{
  code: string;
  description: string;
  rate: number;
}> = [
  {
    code: 'PAR-BLDG-RCC-G+3',
    description: 'RCC framed building (G+3) — civil works',
    rate: 28_500,
  },
  {
    code: 'PAR-BLDG-LOADBEARING',
    description: 'Load-bearing masonry building — civil works',
    rate: 22_400,
  },
  {
    code: 'PAR-ROAD-FLEX',
    description: 'Flexible pavement (per m² carriageway)',
    rate: 4_850,
  },
  {
    code: 'PAR-BLDG-HOSPITAL',
    description: 'Hospital / institutional building — civil works',
    rate: 36_200,
  },
];

export const DEMO_COST_INDEX_OPTIONS: ReadonlyArray<{
  label: string;
  factor: number;
}> = [
  { label: 'Delhi CI 2024 Q4 (1.00 base)', factor: 1.0 },
  { label: 'Delhi CI 2025 Q2 (+8%)', factor: 1.08 },
  { label: 'Delhi CI 2025 Q4 (+12%)', factor: 1.12 },
  { label: 'Delhi CI 2026 Q1 (+18%)', factor: 1.18 },
];
