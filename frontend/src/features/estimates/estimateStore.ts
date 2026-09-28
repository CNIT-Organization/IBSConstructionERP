/**
 * Frontend-first estimate register persistence (localStorage).
 * Seeds demo Delhi works; merges optional BOQ-derived rows when API is available.
 */

import type {
  DEEditorState,
  DELine,
  EstimateRegisterItem,
  EstimateSanctionNotes,
  EstimateStage,
  PEWizardState,
} from './types';
import { ESTIMATE_STAGES } from './types';
import { computeAbstract } from './peCompute';
import { computeDEAbstract } from './deCompute';
import { DSR_CATALOG } from './demoDSR';

const STORAGE_KEY = 'pwd_delhi_estimate_register_v2';

function nowIso(): string {
  return new Date().toISOString();
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyPEWizard(partial?: Partial<PEWizardState>): PEWizardState {
  return {
    id: partial?.id ?? uid('pe'),
    workName: partial?.workName ?? '',
    projectName: partial?.projectName ?? '',
    workType: partial?.workType ?? 'building',
    plinthAreaSqm: partial?.plinthAreaSqm ?? 0,
    locationNote: partial?.locationNote ?? 'Circle / Division — PWD Delhi',
    parCode: partial?.parCode ?? '',
    parDescription: partial?.parDescription ?? '',
    parRate: partial?.parRate ?? 0,
    costIndexFactor: partial?.costIndexFactor ?? 1.18,
    costIndexLabel: partial?.costIndexLabel ?? 'Delhi CI 2026 Q1 (+18%)',
    contingencyPct: partial?.contingencyPct ?? 3,
    stage: partial?.stage ?? 'pe',
    updatedAt: partial?.updatedAt ?? nowIso(),
  };
}

export function createEmptyDE(
  partial?: Partial<DEEditorState> & { lines?: DELine[] },
): DEEditorState {
  return {
    id: partial?.id ?? uid('de'),
    workName: partial?.workName ?? '',
    projectName: partial?.projectName ?? '',
    contingencyPct: partial?.contingencyPct ?? 3,
    lines: partial?.lines ?? [],
    stage: partial?.stage ?? 'de',
    updatedAt: partial?.updatedAt ?? nowIso(),
  };
}

function seedDemoDELines(): DELine[] {
  const pick = (code: string, qty: number): DELine | null => {
    const item = DSR_CATALOG.find((d) => d.code === code);
    if (!item) return null;
    return {
      id: uid('dl'),
      code: item.code,
      description: item.description,
      unit: item.unit,
      qty,
      rate: item.rate,
      isNS: false,
      nsAnalysis: null,
    };
  };
  return [
    pick('16.1', 12_500),
    pick('16.3.1', 1_850),
    pick('16.31.1.1', 12_500),
    pick('16.40.1', 625),
    pick('16.57.1', 500),
  ].filter(Boolean) as DELine[];
}

function seedDemoRows(): EstimateRegisterItem[] {
  const pe = createEmptyPEWizard({
    id: 'pe-demo-school',
    workName: 'Construction of Govt. Sr. Sec. School, Rohini Sec-17',
    projectName: 'Education — Rohini',
    workType: 'building',
    plinthAreaSqm: 4_250,
    parCode: 'PAR-BLDG-RCC-G+3',
    parDescription: 'RCC framed building (G+3) — civil works',
    parRate: 28_500,
    costIndexFactor: 1.18,
    costIndexLabel: 'Delhi CI 2026 Q1 (+18%)',
    contingencyPct: 3,
    stage: 'pe',
  });
  const peAmount = computeAbstract(pe).estimatedCost;

  const deRoad = createEmptyDE({
    id: 'est-demo-de-road',
    workName: 'Strengthening of MDR — Outer Ring Rd stretch',
    projectName: 'Roads — South Circle',
    contingencyPct: 3,
    lines: seedDemoDELines(),
    stage: 'de',
  });
  const deAmount = computeDEAbstract(deRoad).estimatedCost;

  const rows: EstimateRegisterItem[] = [
    {
      id: 'est-demo-rough-drain',
      name: 'Storm water drain improvements — Najafgarh',
      workDescription: 'Rough cost for circular drain lining',
      projectId: null,
      projectName: 'Drainage — Najafgarh',
      stage: 'rough',
      amountInr: 1_85_00_000,
      updatedAt: nowIso(),
      peDraft: null,
      deDraft: null,
    },
    {
      id: pe.id,
      name: pe.workName,
      workDescription: 'Preliminary Estimate (PAR-based)',
      projectId: null,
      projectName: pe.projectName,
      stage: 'pe',
      amountInr: peAmount,
      updatedAt: pe.updatedAt,
      peDraft: pe,
      deDraft: null,
    },
    {
      id: 'est-demo-aaes-hospital',
      name: 'Upgradation of Polyclinic — Dwarka Sec-9',
      workDescription: 'AA/ES accorded — awaiting DE',
      projectId: null,
      projectName: 'Health — Dwarka',
      stage: 'aa_es',
      amountInr: 12_40_00_000,
      updatedAt: nowIso(),
      peDraft: null,
      deDraft: null,
    },
    {
      id: deRoad.id,
      name: deRoad.workName,
      workDescription: 'Detailed Estimate in progress (DSR)',
      projectId: null,
      projectName: deRoad.projectName,
      stage: 'de',
      amountInr: deAmount,
      updatedAt: deRoad.updatedAt,
      peDraft: null,
      deDraft: deRoad,
    },
    {
      id: 'est-demo-ts-bridge',
      name: 'Pedestrian subway — ITO crossing',
      workDescription: 'Technical Sanction pending CE',
      projectId: null,
      projectName: 'Bridges — Central',
      stage: 'ts',
      amountInr: 5_20_00_000,
      updatedAt: nowIso(),
      peDraft: null,
      deDraft: null,
    },
    {
      id: 'est-demo-nit-office',
      name: 'Office complex — PWD HQ annex (Phase-I)',
      workDescription: 'NIT floated',
      projectId: null,
      projectName: 'Buildings — HQ',
      stage: 'nit',
      amountInr: 42_15_00_000,
      updatedAt: nowIso(),
      peDraft: null,
      deDraft: null,
    },
  ];
  return rows;
}

export function loadRegister(): EstimateRegisterItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = seedDemoRows();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    const parsed = JSON.parse(raw) as EstimateRegisterItem[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const seed = seedDemoRows();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    return parsed;
  } catch {
    return seedDemoRows();
  }
}

export function saveRegister(items: EstimateRegisterItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function upsertEstimate(item: EstimateRegisterItem): EstimateRegisterItem[] {
  const list = loadRegister();
  const idx = list.findIndex((r) => r.id === item.id);
  if (idx >= 0) {
    list[idx] = item;
  } else {
    list.unshift(item);
  }
  saveRegister(list);
  return list;
}

export function getEstimateById(id: string): EstimateRegisterItem | undefined {
  return loadRegister().find((r) => r.id === id);
}

export function savePEDraft(state: PEWizardState): EstimateRegisterItem {
  const abstract = computeAbstract(state);
  const updated: PEWizardState = { ...state, updatedAt: nowIso(), stage: 'pe' };
  const existing = getEstimateById(updated.id);
  const item: EstimateRegisterItem = {
    id: updated.id,
    name: updated.workName || 'Untitled PE',
    workDescription: updated.parDescription
      ? `PE — ${updated.parDescription}`
      : 'Preliminary Estimate',
    projectId: null,
    projectName: updated.projectName || '—',
    stage: 'pe' as EstimateStage,
    amountInr: abstract.estimatedCost,
    updatedAt: updated.updatedAt,
    peDraft: updated,
    deDraft: existing?.deDraft ?? null,
  };
  upsertEstimate(item);
  return item;
}

export function saveDEDraft(state: DEEditorState): EstimateRegisterItem {
  const abstract = computeDEAbstract(state);
  const updated: DEEditorState = { ...state, updatedAt: nowIso(), stage: 'de' };
  const existing = getEstimateById(updated.id);
  const item: EstimateRegisterItem = {
    id: updated.id,
    name: updated.workName || 'Untitled DE',
    workDescription:
      abstract.lineCount > 0
        ? `DE — ${abstract.lineCount} DSR/NS line(s)`
        : 'Detailed Estimate (DSR)',
    projectId: existing?.projectId ?? null,
    projectName: updated.projectName || existing?.projectName || '—',
    stage: 'de' as EstimateStage,
    amountInr: abstract.estimatedCost,
    updatedAt: updated.updatedAt,
    peDraft: existing?.peDraft ?? null,
    deDraft: updated,
    boqId: existing?.boqId,
  };
  upsertEstimate(item);
  return item;
}

/** Advance an AA/ES (or earlier) row into DE stage with empty/skeleton draft. */
export function advanceToDE(estimateId: string): EstimateRegisterItem | undefined {
  const existing = getEstimateById(estimateId);
  if (!existing) return undefined;
  if (existing.deDraft) {
    return saveDEDraft({ ...existing.deDraft, stage: 'de' });
  }
  const draft = createEmptyDE({
    id: existing.id,
    workName: existing.name,
    projectName: existing.projectName,
    contingencyPct: existing.peDraft?.contingencyPct ?? 3,
    lines: [],
    stage: 'de',
  });
  return saveDEDraft(draft);
}


/** Next stage in Rough → PE → AA/ES → DE → T/S → NIT, or null at end. */
export function nextStage(stage: EstimateStage): EstimateStage | null {
  const idx = ESTIMATE_STAGES.indexOf(stage);
  if (idx < 0 || idx >= ESTIMATE_STAGES.length - 1) return null;
  return ESTIMATE_STAGES[idx + 1]!;
}

/** Role-ish label for who typically advances from this stage (demo only). */
export function advanceRoleHint(from: EstimateStage): string {
  switch (from) {
    case 'rough':
    case 'pe':
      return 'Planning';
    case 'aa_es':
    case 'de':
    case 'ts':
      return 'Engineer';
    default:
      return 'Officer';
  }
}

export function setEstimateStage(
  estimateId: string,
  stage: EstimateStage,
): EstimateRegisterItem | undefined {
  const existing = getEstimateById(estimateId);
  if (!existing) return undefined;
  const updated: EstimateRegisterItem = {
    ...existing,
    stage,
    updatedAt: nowIso(),
  };
  if (stage === 'pe' && updated.peDraft) {
    updated.peDraft = { ...updated.peDraft, stage: 'pe', updatedAt: updated.updatedAt };
  }
  if (stage === 'de' && updated.deDraft) {
    updated.deDraft = { ...updated.deDraft, stage: 'de', updatedAt: updated.updatedAt };
  }
  upsertEstimate(updated);
  return updated;
}

/** Advance one step along the pipeline (with optional DE draft creation). */
export function advanceEstimateStage(
  estimateId: string,
): EstimateRegisterItem | undefined {
  const existing = getEstimateById(estimateId);
  if (!existing) return undefined;
  const nxt = nextStage(existing.stage);
  if (!nxt) return existing;
  if (nxt === 'de' && !existing.deDraft) {
    return advanceToDE(estimateId);
  }
  if (nxt === 'pe' && !existing.peDraft) {
    const pe = createEmptyPEWizard({
      id: existing.id,
      workName: existing.name,
      projectName: existing.projectName,
      stage: 'pe',
    });
    return savePEDraft(pe);
  }
  return setEstimateStage(estimateId, nxt);
}

export function saveSanctionNotes(
  estimateId: string,
  notes: EstimateSanctionNotes,
): EstimateRegisterItem | undefined {
  const existing = getEstimateById(estimateId);
  if (!existing) return undefined;
  const updated: EstimateRegisterItem = {
    ...existing,
    sanction: {
      aaEsNote: notes.aaEsNote ?? '',
      tsNote: notes.tsNote ?? '',
      powerNote: notes.powerNote ?? '',
    },
    updatedAt: nowIso(),
  };
  upsertEstimate(updated);
  return updated;
}

/** Map BOQ status strings loosely onto estimate stages for optional merge. */
export function stageFromBoqStatus(status: string | undefined | null): EstimateStage {
  const s = (status || '').toLowerCase();
  if (s.includes('nit') || s === 'tendered') return 'nit';
  if (s.includes('ts') || s.includes('sanction')) return 'ts';
  if (s === 'final' || s === 'approved') return 'de';
  if (s === 'draft') return 'pe';
  return 'rough';
}
