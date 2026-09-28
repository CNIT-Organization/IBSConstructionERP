/**
 * PWD Delhi — Works Estimating types (Planning + Engineer wings).
 * Stages follow docs/PWD_DELHI_UI_PLAN.md estimate register.
 */

export type EstimateStage =
  | 'rough'
  | 'pe'
  | 'aa_es'
  | 'de'
  | 'ts'
  | 'nit';

export const ESTIMATE_STAGES: readonly EstimateStage[] = [
  'rough',
  'pe',
  'aa_es',
  'de',
  'ts',
  'nit',
] as const;

export const ESTIMATE_STAGE_LABELS: Record<EstimateStage, string> = {
  rough: 'Rough',
  pe: 'PE',
  aa_es: 'AA/ES',
  de: 'DE',
  ts: 'T/S',
  nit: 'NIT',
};

export interface EstimateRegisterItem {
  id: string;
  name: string;
  workDescription: string;
  projectId: string | null;
  projectName: string;
  stage: EstimateStage;
  amountInr: number;
  updatedAt: string;
  /** Optional link to an existing BOQ if derived from list API */
  boqId?: string | null;
  peDraft?: PEWizardState | null;
  /** Detailed Estimate draft (DSR lines + Abstract of Cost) */
  deDraft?: DEEditorState | null;
  /** Lightweight sanction / status notes (AA/ES, T/S) — demo panel */
  sanction?: EstimateSanctionNotes | null;
}

/** Optional AA/ES + T/S notes shown on Sanction panel (not full workflow). */
export interface EstimateSanctionNotes {
  /** AA/ES status or reference (Planning / Admin) */
  aaEsNote: string;
  /** Technical Sanction note / power (Engineer / CE) */
  tsNote: string;
  /** Sanctioning power / authority text */
  powerNote: string;
}

export interface PEWizardState {
  id: string;
  /** Work / estimate title */
  workName: string;
  projectName: string;
  /** Building / road / other */
  workType: 'building' | 'road' | 'other';
  /** Plinth area in m² (buildings) or equivalent measure */
  plinthAreaSqm: number;
  /** Location note (zone / circle) */
  locationNote: string;
  /** Plinth Area Rate code / description */
  parCode: string;
  parDescription: string;
  /** PAR ₹ / m² */
  parRate: number;
  /** Cost Index factor (e.g. 1.18) */
  costIndexFactor: number;
  costIndexLabel: string;
  /** Contingency percentage (e.g. 3) */
  contingencyPct: number;
  stage: EstimateStage;
  updatedAt: string;
}

export interface AbstractOfCost {
  plinthAreaSqm: number;
  parRate: number;
  costIndexFactor: number;
  baseCost: number;
  indexedCost: number;
  contingencyPct: number;
  contingencyAmount: number;
  estimatedCost: number;
  /** Informational GST 18% for works contract — not added into PE total by default */
  gstPct: number;
  gstAmount: number;
  totalWithGstInfo: number;
}

/** DSR schedule item (PWD Delhi / CPWD SOR-style catalog). */
export interface DSRItem {
  code: string;
  description: string;
  unit: string;
  rate: number;
  category: 'earthwork' | 'concrete' | 'masonry' | 'steel' | 'finishing' | 'road' | 'misc';
}

/** Simple NS (non-schedule) rate analysis stub. */
export interface NSRateAnalysis {
  labour: number;
  material: number;
  overhead: number;
}

export interface DELine {
  id: string;
  code: string;
  description: string;
  unit: string;
  qty: number;
  rate: number;
  /** Non-schedule item with optional rate analysis */
  isNS: boolean;
  nsAnalysis?: NSRateAnalysis | null;
}

export interface DEEditorState {
  id: string;
  workName: string;
  projectName: string;
  contingencyPct: number;
  lines: DELine[];
  stage: EstimateStage;
  updatedAt: string;
}

/** Abstract of Cost derived from DE schedule lines. */
export interface DEAbstractOfCost {
  worksTotal: number;
  contingencyPct: number;
  contingencyAmount: number;
  estimatedCost: number;
  gstPct: number;
  gstAmount: number;
  totalWithGstInfo: number;
  lineCount: number;
}

export const GST_WORKS_PCT = 18;
