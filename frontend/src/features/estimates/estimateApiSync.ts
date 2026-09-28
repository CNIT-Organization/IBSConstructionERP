/**
 * Optional best-effort persistence of PWD Delhi estimate snapshot into
 * linked BOQ.metadata.pwd_delhi_estimate (no new backend module).
 * LocalStorage remains primary; API sync when item.boqId is present.
 */
import { apiGet, apiPatch } from '@/shared/lib/api';
import type { EstimateRegisterItem } from './types';
import { getEstimateById, upsertEstimate } from './estimateStore';

export const PWD_ESTIMATE_META_KEY = 'pwd_delhi_estimate';

interface BoqDetail {
  id: string;
  name?: string;
  description?: string;
  project_id?: string;
  status?: string;
  grand_total?: number;
  updated_at?: string;
  created_at?: string;
  metadata?: Record<string, unknown> | null;
  metadata_?: Record<string, unknown> | null;
}

function snapshotFromItem(item: EstimateRegisterItem): Record<string, unknown> {
  return {
    id: item.id,
    name: item.name,
    workDescription: item.workDescription,
    projectId: item.projectId,
    projectName: item.projectName,
    stage: item.stage,
    amountInr: item.amountInr,
    updatedAt: item.updatedAt,
    peDraft: item.peDraft ?? null,
    deDraft: item.deDraft ?? null,
    sanction: item.sanction ?? null,
    syncedAt: new Date().toISOString(),
  };
}

function readMeta(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return metadata && typeof metadata === 'object' ? { ...metadata } : {};
}

/** Merge snapshot into BOQ metadata when item.boqId is set. Failures are ignored. */
export async function syncEstimateToBoq(
  item: EstimateRegisterItem,
): Promise<boolean> {
  if (!item.boqId) return false;
  try {
    const boq = await apiGet<BoqDetail>(`/v1/boq/boqs/${item.boqId}`);
    const existing = readMeta(
      (boq.metadata as Record<string, unknown> | null | undefined) ??
        (boq.metadata_ as Record<string, unknown> | null | undefined),
    );
    const next = {
      ...existing,
      [PWD_ESTIMATE_META_KEY]: snapshotFromItem(item),
    };
    await apiPatch(`/v1/boq/boqs/${item.boqId}`, { metadata: next });
    return true;
  } catch {
    return false;
  }
}

/** Fire-and-forget sync when boqId present. */
export function queueSyncEstimateToBoq(item: EstimateRegisterItem | undefined | null): void {
  if (!item?.boqId) return;
  void syncEstimateToBoq(item);
}

/** Read optional pwd_delhi_estimate snapshot from BOQ metadata. */
export function estimateFromBoqMetadata(
  boqId: string,
  metadata: Record<string, unknown> | null | undefined,
  fallback?: Partial<EstimateRegisterItem>,
): EstimateRegisterItem | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const snap = metadata[PWD_ESTIMATE_META_KEY];
  if (!snap || typeof snap !== 'object') return null;
  const s = snap as Partial<EstimateRegisterItem>;
  if (!s.name && !fallback?.name) return null;
  return {
    id: String(s.id || fallback?.id || `boq-${boqId}`),
    name: String(s.name || fallback?.name || 'Untitled'),
    workDescription: String(s.workDescription ?? fallback?.workDescription ?? ''),
    projectId: (s.projectId as string | null) ?? fallback?.projectId ?? null,
    projectName: String(s.projectName ?? fallback?.projectName ?? '—'),
    stage: (s.stage as EstimateRegisterItem['stage']) ?? fallback?.stage ?? 'rough',
    amountInr: Number(s.amountInr ?? fallback?.amountInr) || 0,
    updatedAt: String(s.updatedAt ?? fallback?.updatedAt ?? new Date().toISOString()),
    boqId,
    peDraft: (s.peDraft as EstimateRegisterItem['peDraft']) ?? null,
    deDraft: (s.deDraft as EstimateRegisterItem['deDraft']) ?? null,
    sanction: (s.sanction as EstimateRegisterItem['sanction']) ?? null,
  };
}

/**
 * Prefer metadata snapshot when present; otherwise bare BOQ-derived row.
 * When snapshot exists, also upsert into localStorage so refresh survives offline.
 */
export function mergeBoqRowWithMetadata(
  boq: {
    id: string;
    name: string;
    description?: string;
    project_id: string;
    status: string;
    grand_total?: number;
    updated_at?: string;
    created_at?: string;
    metadata?: Record<string, unknown> | null;
  },
  projectName: string,
  stageFromStatus: (status: string) => EstimateRegisterItem['stage'],
  opts?: { persistHydrated?: boolean },
): EstimateRegisterItem {
  const fallback: EstimateRegisterItem = {
    id: `boq-${boq.id}`,
    name: boq.name,
    workDescription: boq.description || 'From BOQ list',
    projectId: boq.project_id,
    projectName,
    stage: stageFromStatus(boq.status),
    amountInr: boq.grand_total ?? 0,
    updatedAt: boq.updated_at || boq.created_at || new Date().toISOString(),
    boqId: boq.id,
    peDraft: null,
    deDraft: null,
    sanction: null,
  };
  const hydrated = estimateFromBoqMetadata(boq.id, boq.metadata ?? null, fallback);
  const row = hydrated
    ? {
        ...hydrated,
        boqId: boq.id,
        projectId: hydrated.projectId ?? boq.project_id,
        projectName: hydrated.projectName || projectName,
      }
    : fallback;

  if (hydrated && opts?.persistHydrated !== false) {
    try {
      const local = getEstimateById(row.id);
      const serverTs = new Date(row.updatedAt).getTime() || 0;
      const localTs = local ? new Date(local.updatedAt).getTime() || 0 : 0;
      // Prefer newer snapshot; always fill local when missing.
      if (!local || serverTs >= localTs) {
        upsertEstimate(row);
      } else {
        // Keep local edits but ensure boqId link is set for future sync.
        if (local && !local.boqId) {
          upsertEstimate({ ...local, boqId: boq.id });
        }
        return local.boqId ? local : { ...local, boqId: boq.id };
      }
    } catch {
      // ignore quota / private mode
    }
  }
  return row;
}
