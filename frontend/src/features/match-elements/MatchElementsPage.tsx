// DDC-CWICR-OE: DataDrivenConstruction · OpenConstructionERP
// Copyright (c) 2026 Artem Boiko / DataDrivenConstruction
//
// /match-elements — full UX redesign.
//
// Drives BIM-element → CWICR cost-position matching end-to-end so an
// estimator can take a 5000-element Revit/IFC model and get a real BOQ
// with real cost in the project's currency in minutes. No mock data,
// no NIL UUID kludges, no hardcoded confidence thresholds.
//
// Layout (single column, no slide-overs except the detail panel):
//
//   1. Project context bar    — active project (from useProjectContextStore)
//   2. BIM model tab strip    — one tab per BIM model in the project
//   3. Session picker         — resume an existing session or start fresh
//   4. Action toolbar         — primary CTA morphs vector → confirm → apply
//   5. Settings rail          — group-by chips, threshold, net/gross,
//                               trade filter, confidence-band legend
//   6. Group list             — one row per group with display_label,
//                               suggested cost, confidence pill, status
//   7. Detail panel           — slide-over with elements / methods / apply
//                               (existing component, kept)

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ChevronsRight,
  Database,
  FileSpreadsheet,
  FileText,
  Languages,
  Layers,
  Library,
  Link2,
  Loader2,
  PlayCircle,
  RefreshCw,
  Search,
  Sparkles,
  XCircle,
} from 'lucide-react';

import { useProjectContextStore } from '@/stores/useProjectContextStore';
import { useToastStore } from '@/stores/useToastStore';
import { projectsApi } from '@/features/projects/api';
import { Toggle } from '@/shared/ui/Toggle';
import { Slider } from '@/shared/ui/Slider';
import { ChipBar, type Chip } from '@/shared/ui/ChipBar';
import { BIMModelPicker } from '@/shared/ui/BIMModelPicker';

import {
  matchElementsApi,
  CONSTRUCTION_STAGES,
  fetchVectorReadiness,
  type AttributeKey,
  type ConfidenceBand,
  type ConstructionStage,
  type GroupSummary,
  type MatcherName,
  type VectorReadiness,
  type MatchSession,
  type SessionSummary,
  type TradeBucket,
} from './api';
import { EmbedderStatusCard } from './EmbedderStatusCard';
import { MatchAnalyticsCard } from './MatchAnalyticsCard';
import { MatchDetailPanel } from './MatchDetailPanel';
import { NewSessionFromExcelModal } from './NewSessionFromExcelModal';
import { NewSessionFromTextModal } from './NewSessionFromTextModal';
import { TemplatesPanel } from './TemplatesPanel';

// ─────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────

// Popular group-by keys shown by default. Universal across BIM/IFC/Revit
// regardless of project locale or modelling discipline. Anything else is
// tenant-specific (custom shared parameters, IFC PSet keys) and is hidden
// behind a "Show all" toggle to keep the chip-bar scannable.
const POPULAR_GROUP_BY_KEYS: ReadonlySet<string> = new Set([
  'ifc_class',
  'type_name',
  'family',
  'family_name',
  'material',
  'level',
  'level_name',
  'storey',
  'category',
  'name',
  'discipline',
]);

const TRADE_COLOURS: Record<TradeBucket, string> = {
  architectural: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  structural: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
  mep: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
  civil: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  spatial: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  subtractive: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200',
  annotation: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  other: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

function StatusBadge({ status }: { status: GroupSummary['status'] }) {
  const { t } = useTranslation();
  const palette: Record<string, string> = {
    unmatched: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    suggested: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    confirmed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
    skipped: 'bg-slate-200 text-slate-500 line-through dark:bg-slate-700 dark:text-slate-400',
    tbd: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
    applied: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
    overridden: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded ${
        palette[status] ?? palette.unmatched
      }`}
    >
      {t(`match_elements.status.${status}`, status)}
    </span>
  );
}

function ConfidencePill({
  band,
  score,
}: {
  band: ConfidenceBand;
  score: string | null;
}) {
  if (band === 'none' || !score) {
    return <span className="text-slate-400 text-xs">—</span>;
  }
  const cls =
    band === 'high'
      ? 'bg-emerald-500'
      : band === 'medium'
        ? 'bg-amber-500'
        : 'bg-rose-500';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block w-2 h-2 rounded-full ${cls}`} />
      <span className="text-xs tabular-nums text-slate-600 dark:text-slate-300">
        {Number(score).toFixed(2)}
      </span>
    </span>
  );
}

function fmtNum(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

// ─────────────────────────────────────────────────────────────────────────
//  Sub-components
// ─────────────────────────────────────────────────────────────────────────

/** Visual readiness band for the cwicr_<lang>_v3 collection.
 *  Green = collection loaded and populated; amber = empty/missing/no-country
 *  (recoverable by visiting /costs); red = engine unreachable. */
function vectorBandPalette(band: VectorReadiness['status_band']): {
  dot: string;
  text: string;
  border: string;
  bg: string;
} {
  switch (band) {
    case 'ready':
      return {
        dot: 'bg-emerald-500',
        text: 'text-emerald-700 dark:text-emerald-300',
        border: 'border-emerald-200 dark:border-emerald-800',
        bg: 'bg-emerald-50 dark:bg-emerald-950/30',
      };
    case 'empty':
    case 'missing':
    case 'no_country':
    case 'non_qdrant':
      return {
        dot: 'bg-amber-500',
        text: 'text-amber-800 dark:text-amber-200',
        border: 'border-amber-200 dark:border-amber-800',
        bg: 'bg-amber-50 dark:bg-amber-950/30',
      };
    case 'disconnected':
    default:
      return {
        dot: 'bg-rose-500',
        text: 'text-rose-700 dark:text-rose-300',
        border: 'border-rose-200 dark:border-rose-800',
        bg: 'bg-rose-50 dark:bg-rose-950/30',
      };
  }
}

/** Inline readiness pill — explains in one line which CWICR collection
 *  the page is talking to and whether it's loaded. Sized to sit inside
 *  the project card without dominating it. */
function VectorReadinessPill({
  readiness,
  isLoading,
}: {
  readiness: VectorReadiness | undefined;
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  if (isLoading) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-surface-primary text-xs text-content-tertiary">
        <Loader2 className="w-3 h-3 animate-spin" />
        {t('match_elements.vector_status_loading', 'Checking vector DB…')}
      </span>
    );
  }
  if (!readiness) return null;

  const palette = vectorBandPalette(readiness.status_band);
  const lang = readiness.language ? readiness.language.toUpperCase() : '—';
  const collection = readiness.collection || '—';

  let label: string;
  let detail: string;
  switch (readiness.status_band) {
    case 'ready':
      label = t('match_elements.vector_status_ready', 'Vector DB ready');
      detail = t(
        'match_elements.vector_status_ready_detail',
        '{{lang}} · {{rateCount}} rates · {{collection}}',
        {
          lang,
          rateCount: readiness.points_count.toLocaleString(),
          collection,
        },
      );
      break;
    case 'empty':
      label = t('match_elements.vector_status_empty', 'Vector DB empty');
      detail = t(
        'match_elements.vector_status_empty_detail',
        '{{lang}} · {{collection}} loaded but 0 rates — vectorize on /costs',
        { lang, collection },
      );
      break;
    case 'missing':
      label = t('match_elements.vector_status_missing', 'Collection not loaded');
      detail = t(
        'match_elements.vector_status_missing_detail',
        '{{collection}} for language "{{lang}}" not in Qdrant — visit /costs to vectorize',
        { lang, collection },
      );
      break;
    case 'no_country':
      label = t(
        'match_elements.vector_status_no_country',
        'Region/language unknown',
      );
      detail = t(
        'match_elements.vector_status_no_country_detail',
        'Set the project region in /projects/.../settings to pin the collection',
      );
      break;
    case 'non_qdrant':
      label = t(
        'match_elements.vector_status_non_qdrant',
        'Legacy LanceDB backend',
      );
      detail = t(
        'match_elements.vector_status_non_qdrant_detail',
        'Per-language collections only apply on Qdrant — current engine is LanceDB',
      );
      break;
    case 'disconnected':
    default:
      label = t(
        'match_elements.vector_status_disconnected',
        'Vector DB unreachable',
      );
      detail = readiness.error
        ? t(
            'match_elements.vector_status_disconnected_detail',
            'Qdrant is not responding · {{error}}',
            { error: readiness.error.slice(0, 60) },
          )
        : t(
            'match_elements.vector_status_disconnected_help',
            'Qdrant is not responding — matchers will fall back to lexical only',
          );
      break;
  }

  const isAmber = ['empty', 'missing', 'no_country', 'non_qdrant'].includes(
    readiness.status_band,
  );
  const showCostsLink = isAmber && readiness.status_band !== 'no_country';

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${palette.border} ${palette.bg}`}
      role="status"
      aria-live="polite"
      title={detail}
    >
      <Database className={`w-4 h-4 ${palette.text} shrink-0`} />
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className={`font-medium ${palette.text}`}>{label}</span>
        <span className="text-content-tertiary truncate max-w-[60ch]">
          {detail}
        </span>
      </div>
      {showCostsLink && (
        <Link
          to="/costs"
          className={`shrink-0 inline-flex items-center gap-1 underline ${palette.text} hover:opacity-80`}
        >
          {t('match_elements.vector_status_open_costs', 'Open /costs')}
        </Link>
      )}
    </div>
  );
}

/** Region-language correspondence chip — surfaces how the project's
 *  region resolves to the cwicr_<lang>_v3 collection. Always visible
 *  next to the project name so the user can see the mapping at a glance. */
function ProjectRegionLangChip({
  region,
  language,
  currency,
}: {
  region: string | null;
  language: string;
  currency: string | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="inline-flex flex-wrap items-center gap-1.5 text-xs">
      {region && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-200 font-medium">
          <Layers className="w-3 h-3" />
          {region}
        </span>
      )}
      {language && (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-200 font-medium uppercase"
          title={t(
            'match_elements.region_lang_help',
            'Project region resolves to this language → cwicr_{{lang}}_v3 collection',
            { lang: language },
          )}
        >
          <Languages className="w-3 h-3" />
          {language}
        </span>
      )}
      {currency && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 font-medium uppercase">
          {currency}
        </span>
      )}
    </div>
  );
}

/** Workflow step indicator. Visualises the four-step BIM→BOQ flow as a
 *  horizontal "stepper" with completed checks, the current active dot,
 *  and pending dots. Lives in the hero block so the user always knows
 *  what step they are on without reading the section labels.
 *
 *  Steps: 1) BIM model · 2) Session · 3) Review groups · 4) Apply to BOQ */
function WorkflowStepIndicator({
  step,
  totalGroups,
  confirmedCount,
  appliedCount,
  hasModel,
  hasSession,
}: {
  step: 1 | 2 | 3 | 4;
  totalGroups: number;
  confirmedCount: number;
  appliedCount: number;
  hasModel: boolean;
  hasSession: boolean;
}) {
  const { t } = useTranslation();
  const items: Array<{
    n: 1 | 2 | 3 | 4;
    label: string;
    detail: string;
  }> = [
    {
      n: 1,
      label: t('match_elements.step_1_label', 'Pick model'),
      detail: hasModel
        ? t('match_elements.step_1_done', 'Selected')
        : t('match_elements.step_1_help', 'Choose BIM model'),
    },
    {
      n: 2,
      label: t('match_elements.step_2_label', 'Open session'),
      detail: hasSession
        ? t('match_elements.step_2_done', 'Active')
        : t('match_elements.step_2_help', 'Resume or create'),
    },
    {
      n: 3,
      label: t('match_elements.step_3_label', 'Review matches'),
      detail:
        totalGroups === 0
          ? t('match_elements.step_3_empty', 'No groups yet')
          : t(
              'match_elements.step_3_progress',
              '{{confirmed}}/{{total}} confirmed',
              { confirmed: confirmedCount, total: totalGroups },
            ),
    },
    {
      n: 4,
      label: t('match_elements.step_4_label', 'Apply to BOQ'),
      detail:
        appliedCount > 0
          ? t('match_elements.step_4_done', '{{n}} applied', {
              n: appliedCount,
            })
          : t('match_elements.step_4_help', 'Write to BOQ'),
    },
  ];

  return (
    <ol className="flex items-center gap-1 w-full overflow-x-auto" role="list">
      {items.map((it, idx) => {
        const isDone = step > it.n;
        const isActive = step === it.n;
        return (
          <li
            key={it.n}
            className="flex items-center gap-1 min-w-0"
            aria-current={isActive ? 'step' : undefined}
          >
            <div
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition ${
                isActive
                  ? 'bg-white dark:bg-surface-primary shadow-sm border border-indigo-300 dark:border-indigo-600 ring-2 ring-indigo-200/60 dark:ring-indigo-700/40'
                  : isDone
                    ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/60'
                    : 'bg-white/40 dark:bg-surface-primary/40 border border-transparent'
              }`}
            >
              <span
                className={`shrink-0 w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] font-bold ${
                  isDone
                    ? 'bg-emerald-500 text-white'
                    : isActive
                      ? 'bg-gradient-to-br from-indigo-500 to-sky-500 text-white shadow-sm shadow-indigo-500/20'
                      : 'bg-content-tertiary/15 text-content-tertiary'
                }`}
              >
                {isDone ? <CheckCircle2 className="w-3 h-3" /> : it.n}
              </span>
              <div className="min-w-0">
                <div
                  className={`text-[11px] font-semibold leading-tight ${
                    isActive
                      ? 'text-content-primary'
                      : isDone
                        ? 'text-emerald-800 dark:text-emerald-200'
                        : 'text-content-tertiary'
                  }`}
                >
                  {it.label}
                </div>
                <div
                  className={`text-[10px] leading-tight ${
                    isActive
                      ? 'text-indigo-700 dark:text-indigo-300'
                      : 'text-content-tertiary'
                  }`}
                >
                  {it.detail}
                </div>
              </div>
            </div>
            {idx < items.length - 1 && (
              <ChevronRight
                className={`w-3.5 h-3.5 shrink-0 ${
                  step > it.n
                    ? 'text-emerald-400 dark:text-emerald-500'
                    : 'text-content-tertiary/40'
                }`}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Rich project context card — single source of truth for "which
 *  project + which CWICR collection is /match-elements pointed at?".
 *  Replaces the v2.9.x one-line bar so the user can verify at a glance
 *  that the language a match query will hit matches the project locale. */
function ProjectContextCard({
  projectId,
}: {
  projectId: string | null;
}) {
  const { t } = useTranslation();
  const activeProjectName = useProjectContextStore((s) => s.activeProjectName);

  // Project metadata (region, currency, locale) — needed to derive the
  // vector collection and to render the badges.
  const projectQ = useQuery({
    enabled: !!projectId,
    queryKey: ['match-project-meta', projectId],
    queryFn: () => projectsApi.get(projectId!),
    staleTime: 5 * 60 * 1000,
  });

  // Vector DB readiness for this project's region. Polls every 60 s so
  // a fresh vectorisation on /costs surfaces here without a manual refresh.
  // The project_id arg also returns ``language_mismatch`` diagnostics so
  // we can warn when the bound catalogue speaks a different language than
  // the project region (a sign that auto_bind_dominant_catalogue picked
  // by row count before the language-aware fix landed in 2.9.34).
  const region = projectQ.data?.region ?? '';
  const readinessQ = useQuery({
    enabled: !!projectId,
    queryKey: ['match-vector-readiness', region || projectId, projectId],
    queryFn: () => fetchVectorReadiness(region, projectId),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const queryClient = useQueryClient();
  const rebindMut = useMutation({
    mutationFn: async () => {
      // Clear the binding — the next session-create or readiness probe
      // triggers auto_bind_dominant_catalogue, which is now language-aware
      // and prefers a catalogue whose language matches project.region.
      const { setProjectCatalog } = await import('@/features/match/api');
      return setProjectCatalog(projectId!, null);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['match-vector-readiness'],
      });
      await queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'match-settings'],
      });
      await readinessQ.refetch();
    },
  });

  if (!projectId) {
    return (
      <div className="px-4 py-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 text-sm">
        <p className="font-medium text-amber-900 dark:text-amber-200">
          {t(
            'match_elements.no_project_title',
            'No active project selected.',
          )}
        </p>
        <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
          {t(
            'match_elements.no_project_hint',
            'Open the project picker in the header, or visit',
          )}{' '}
          <Link to="/projects" className="underline font-medium">
            /projects
          </Link>
          .
        </p>
      </div>
    );
  }

  const project = projectQ.data;
  const displayName =
    project?.name || activeProjectName || projectId.slice(0, 8);

  return (
    <div className="rounded-xl border border-border bg-surface-primary p-5 flex flex-col gap-4 shadow-sm">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4 min-w-0">
          <div className="shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-100 to-sky-100 dark:from-indigo-900/50 dark:to-sky-900/40 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center shadow-sm">
            <Layers className="w-6 h-6 text-indigo-600 dark:text-indigo-300" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase tracking-[0.12em] text-content-tertiary font-semibold">
                {t('match_elements.active_project', 'Active project')}
              </span>
            </div>
            <h2
              className="text-lg lg:text-xl font-semibold text-content-primary truncate max-w-[60ch] leading-tight"
              title={displayName}
            >
              {displayName}
            </h2>
            <div className="mt-2">
              <ProjectRegionLangChip
                region={project?.region ?? null}
                language={readinessQ.data?.language ?? ''}
                currency={project?.currency ?? null}
              />
            </div>
          </div>
        </div>
        <Link
          to={`/projects/${projectId}/settings`}
          className="text-xs underline text-content-tertiary hover:text-content-primary shrink-0"
          title={t(
            'match_elements.project_settings_help',
            'Open project settings (region, currency, locale, fx rates)',
          )}
        >
          {t('match_elements.project_settings', 'Project settings')}
        </Link>
      </div>
      <VectorReadinessPill
        readiness={readinessQ.data}
        isLoading={readinessQ.isLoading}
      />
      {readinessQ.data?.language_mismatch?.status === 'mismatch' && (
        <LanguageMismatchBanner
          mismatch={readinessQ.data.language_mismatch}
          onRebind={() => rebindMut.mutate()}
          isRebinding={rebindMut.isPending}
          rebindError={
            rebindMut.error ? String(rebindMut.error) : null
          }
        />
      )}
    </div>
  );
}

/** Cross-language binding warning. Surfaces when the project's bound
 *  CWICR catalogue speaks a different language than the project region —
 *  e.g. a US project bound to RU_MOSCOW, which would surface Russian
 *  descriptions on /match-elements. The "Re-bind" CTA clears the binding
 *  and lets ``auto_bind_dominant_catalogue`` (now language-aware) pick
 *  a language-matching catalogue on the next session create. */
function LanguageMismatchBanner({
  mismatch,
  onRebind,
  isRebinding,
  rebindError,
}: {
  mismatch: NonNullable<VectorReadiness['language_mismatch']>;
  onRebind: () => void;
  isRebinding: boolean;
  rebindError: string | null;
}) {
  const { t } = useTranslation();
  const projLang = (mismatch.project_language || '').toUpperCase();
  const boundLang = (mismatch.bound_language || '').toUpperCase();
  return (
    <div
      className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-3 py-2.5 text-xs"
      role="alert"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-amber-900 dark:text-amber-100">
            {t(
              'match_elements.lang_mismatch_title',
              'Catalogue language does not match project',
            )}
          </div>
          <div className="text-amber-800 dark:text-amber-200 mt-0.5">
            {t(
              'match_elements.lang_mismatch_detail',
              'Project region {{region}} speaks {{projLang}}, but the bound catalogue {{catalogue}} is in {{boundLang}}. Match results will surface in the wrong language until you re-bind.',
              {
                region: mismatch.project_region || '—',
                projLang: projLang || '—',
                catalogue: mismatch.bound_catalogue || '—',
                boundLang: boundLang || '—',
              },
            )}
          </div>
          {rebindError && (
            <div className="text-rose-700 dark:text-rose-300 mt-1.5">
              {rebindError}
            </div>
          )}
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onRebind}
              disabled={isRebinding}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium"
            >
              {isRebinding ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              {t('match_elements.lang_mismatch_rebind', 'Re-bind catalogue')}
            </button>
            <Link
              to="/costs"
              className="text-amber-800 dark:text-amber-200 underline hover:opacity-80"
            >
              {t(
                'match_elements.lang_mismatch_open_costs',
                'Or load a {{lang}} catalogue',
                { lang: projLang || '—' },
              )}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function SessionPicker({
  projectId,
  sessions,
  isLoading,
  activeSessionId,
  onPick,
  onCreate,
  onCreateText,
  onCreateExcel,
  isCreating,
}: {
  projectId: string;
  sessions: SessionSummary[];
  isLoading: boolean;
  activeSessionId: string | null;
  onPick: (id: string) => void;
  onCreate: () => void;
  onCreateText: () => void;
  onCreateExcel: () => void;
  isCreating: boolean;
}) {
  const { t } = useTranslation();
  if (!projectId) return null;
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-content-tertiary py-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t('match_elements.loading_sessions', 'Loading sessions…')}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {sessions.length === 0 && (
        <span className="text-xs text-content-tertiary mr-1">
          {t(
            'match_elements.no_prior_sessions',
            'No prior matching sessions for this project.',
          )}
        </span>
      )}
      {sessions.map((s) => {
        const isActive = s.id === activeSessionId;
        const lastSeen = s.last_active_at
          ? new Date(s.last_active_at).toLocaleString()
          : '';
        const progress =
          s.group_count > 0
            ? Math.round((s.confirmed_count / s.group_count) * 100)
            : 0;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s.id)}
            title={lastSeen}
            className={`inline-flex flex-col items-start gap-1 rounded-lg border px-3 py-2 text-sm transition max-w-[40ch] ${
              isActive
                ? 'border-oe-blue bg-oe-blue/5 text-content-primary shadow-sm'
                : 'border-border bg-surface-primary text-content-secondary hover:border-oe-blue/40'
            }`}
          >
            <span className="truncate font-medium max-w-[36ch]">
              {s.name ||
                t('match_elements.session_default_name', 'Session {{id}}', {
                  id: s.id.slice(0, 8),
                })}
            </span>
            <span className="flex items-center gap-2 text-xs">
              <span className="tabular-nums opacity-70">
                {s.confirmed_count}/{s.group_count}{' '}
                {t('match_elements.session_confirmed', 'confirmed')}
              </span>
              <span className="opacity-50 tabular-nums">{progress}%</span>
              {s.applied_count > 0 && s.currency && (
                <span className="tabular-nums opacity-70">
                  ·{' '}
                  {s.total_value > 0 ? fmtNum(s.total_value, 0) : '0'}{' '}
                  {s.currency}
                </span>
              )}
            </span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={onCreate}
        disabled={isCreating}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-content-tertiary hover:border-oe-blue/40 hover:text-oe-blue disabled:opacity-50"
      >
        {isCreating ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Sparkles className="w-4 h-4" />
        )}
        {t('match_elements.new_session', 'New session')}
      </button>
      <button
        type="button"
        onClick={onCreateText}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-content-tertiary hover:border-oe-blue/40 hover:text-oe-blue"
        title={t(
          'match_elements.new_text.button_title',
          'Paste descriptions — one per line',
        )}
      >
        <FileText className="w-4 h-4" />
        {t('match_elements.new_text.button', 'From text')}
      </button>
      <button
        type="button"
        onClick={onCreateExcel}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-content-tertiary hover:border-emerald-500/40 hover:text-emerald-700"
        title={t(
          'match_elements.new_excel.button_title',
          'Upload an .xlsx Bill of Quantities',
        )}
      >
        <FileSpreadsheet className="w-4 h-4" />
        {t('match_elements.new_excel.button', 'From Excel BoQ')}
      </button>
    </div>
  );
}

function ConfidenceLegend({
  high,
  medium,
}: {
  high: number;
  medium: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="text-content-tertiary">
        {t('match_elements.legend_label', 'Confidence')}:
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        {t('match_elements.legend_high', 'High')}{' '}
        <span className="tabular-nums opacity-60">≥ {high.toFixed(2)}</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-amber-500" />
        {t('match_elements.legend_medium', 'Medium')}{' '}
        <span className="tabular-nums opacity-60">≥ {medium.toFixed(2)}</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-rose-500" />
        {t('match_elements.legend_low', 'Low')}
      </span>
    </div>
  );
}

function GroupListBody({
  groups,
  isLoading,
  selected,
  onToggleOne,
  onOpenDetail,
}: {
  groups: GroupSummary[];
  isLoading: boolean;
  selected: Set<string>;
  onToggleOne: (key: string) => void;
  onOpenDetail: (g: GroupSummary) => void;
}) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="px-3 py-12 text-center text-content-tertiary">
        <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
        {t('match_elements.loading_groups', 'Loading groups…')}
      </div>
    );
  }
  if (groups.length === 0) {
    return (
      <div className="px-3 py-12 text-center text-content-tertiary text-sm">
        {t(
          'match_elements.no_groups',
          'No groups yet — import a BIM model to populate this project.',
        )}
      </div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0 z-10">
        <tr className="border-b border-slate-200 dark:border-slate-700">
          <th className="px-3 py-2 w-8" />
          <th className="text-left px-3 py-2 font-medium">
            {t('match_elements.col.group', 'Group')}
          </th>
          <th className="text-right px-3 py-2 font-medium">
            {t('match_elements.col.count', 'Count')}
          </th>
          <th className="text-right px-3 py-2 font-medium">
            {t('match_elements.col.total_qty', 'Total qty')}
          </th>
          <th className="text-left px-3 py-2 font-medium">
            {t('match_elements.col.suggested', 'Suggested cost')}
          </th>
          <th className="text-left px-3 py-2 font-medium">
            {t('match_elements.col.confidence', 'Confidence')}
          </th>
          <th className="text-left px-3 py-2 font-medium">
            {t('match_elements.col.status', 'Status')}
          </th>
          <th className="text-right px-3 py-2 font-medium">
            {t('match_elements.col.actions', 'Actions')}
          </th>
        </tr>
      </thead>
      <tbody>
        {groups.map((g) => {
          const isSelected = selected.has(g.group_key);
          const tradeCls = TRADE_COLOURS[g.trade] ?? TRADE_COLOURS.other;
          return (
            <tr
              key={g.id}
              className={`border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                isSelected ? 'bg-indigo-50/40 dark:bg-indigo-900/10' : ''
              }`}
            >
              <td className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleOne(g.group_key)}
                  aria-label={t(
                    'match_elements.aria.select_group',
                    'Select {{key}}',
                    { key: g.group_key },
                  )}
                />
              </td>
              <td className="px-3 py-2 max-w-[40ch]">
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase ${tradeCls}`}>
                    {t(`match_elements.trade.${g.trade}`, g.trade)}
                  </span>
                  <span
                    className="font-medium truncate"
                    title={g.group_key}
                  >
                    {g.display_label || g.group_key}
                  </span>
                  {g.is_subtractive && (
                    <span
                      className="text-[10px] px-1 py-0.5 rounded bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300"
                      title={t(
                        'match_elements.subtractive_hint',
                        'Subtractive / non-billable',
                      )}
                    >
                      {t('match_elements.subtractive_badge', 'void')}
                    </span>
                  )}
                  {g.opening_warning && (
                    <span
                      className="inline-flex items-center text-amber-600 dark:text-amber-400"
                      title={t(
                        'match_elements.detail.opening_warning',
                        'host has openings but gross == net (IFC export bug)',
                      )}
                    >
                      <AlertCircle className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
                {g.sample_names.length > 0 && (
                  <div className="text-[11px] text-content-tertiary truncate mt-0.5">
                    {g.sample_names.slice(0, 2).join(' · ')}
                  </div>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {g.element_count}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {fmtNum(g.primary_quantity)}{' '}
                <span className="text-content-tertiary">
                  {g.chosen_unit ?? ''}
                </span>
              </td>
              <td className="px-3 py-2 max-w-[32ch]">
                {g.suggested_code ? (
                  <div className="text-xs">
                    <div className="font-mono text-content-tertiary">
                      {g.suggested_code}
                    </div>
                    <div className="truncate" title={g.suggested_description ?? ''}>
                      {g.suggested_description}
                    </div>
                    {g.suggested_unit_rate != null && (
                      <div className="text-[11px] text-content-tertiary tabular-nums">
                        {fmtNum(g.suggested_unit_rate)}{' '}
                        {g.suggested_currency}/{g.chosen_unit ?? ''}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-content-tertiary text-xs">—</span>
                )}
              </td>
              <td className="px-3 py-2">
                <ConfidencePill band={g.confidence_band} score={g.confidence} />
              </td>
              <td className="px-3 py-2">
                <StatusBadge status={g.status} />
              </td>
              <td className="px-3 py-2 text-right">
                <button
                  type="button"
                  onClick={() => onOpenDetail(g)}
                  aria-label={t(
                    'match_elements.detail_for',
                    'Open detail panel for {{label}}',
                    { label: g.display_label || g.group_key },
                  )}
                  className="px-2 py-1 text-xs rounded border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-200 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 inline-flex items-center gap-1 transition"
                >
                  {t('match_elements.detail', 'Detail')}{' '}
                  <ChevronRight className="w-3 h-3" />
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  Page
// ─────────────────────────────────────────────────────────────────────────

export function MatchElementsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const projectId = useProjectContextStore((s) => s.activeProjectId);
  const addToast = useToastStore((s) => s.addToast);
  const [searchParams] = useSearchParams();

  const [activeBimModelId, setActiveBimModelId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showTextModal, setShowTextModal] = useState(false);
  const [showExcelModal, setShowExcelModal] = useState(false);

  // Honour the ?project=<id> deep-link: if the URL names a project that
  // differs from the active one, switch the store. This is what makes
  // /match-elements?project=<uuid> universal — the page actually shows
  // the requested project, not whichever one happens to be in the store.
  useEffect(() => {
    const urlProjectId = searchParams.get('project');
    if (!urlProjectId) return;
    if (urlProjectId === useProjectContextStore.getState().activeProjectId) return;
    (async () => {
      try {
        const list = await projectsApi.list();
        const target = list.find((p) => p.id === urlProjectId);
        if (target) {
          useProjectContextStore.getState().setActiveProject(target.id, target.name);
        }
      } catch {
        /* graceful — page already handles no-project state */
      }
    })();
  }, [searchParams]);

  // Auto-pick the first project when none is active AND no URL param. Mirrors
  // the pattern in /reports, /boq, /finance — saves a click when the user
  // lands here from navigation without going through the project picker.
  const hasLoadedProjects = useRef(false);
  useEffect(() => {
    if (hasLoadedProjects.current) return;
    if (searchParams.get('project')) return;  // URL handler wins
    hasLoadedProjects.current = true;
    (async () => {
      try {
        const data = await projectsApi.list();
        const { activeProjectId: currentActive, setActiveProject: setProj } =
          useProjectContextStore.getState();
        if (!currentActive && data.length > 0) {
          const first = data[0]!;
          setProj(first.id, first.name);
        }
      } catch {
        /* graceful — page already handles no-project state */
      }
    })();
  }, [searchParams]);

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [tradeFilter, setTradeFilter] = useState<TradeBucket[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<GroupSummary | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAllGroupKeys, setShowAllGroupKeys] = useState(false);

  // ── BIM models for the current project ───────────────────────────────
  const bimModelsQ = useQuery({
    enabled: !!projectId,
    queryKey: ['match-bim-models', projectId],
    queryFn: () => matchElementsApi.listBIMModels(projectId!),
  });

  useEffect(() => {
    if (!activeBimModelId && bimModelsQ.data && bimModelsQ.data.length > 0) {
      const ready = bimModelsQ.data.find((m) => m.status === 'ready');
      if (ready) setActiveBimModelId(ready.id);
    }
  }, [bimModelsQ.data, activeBimModelId]);

  // Reset session/selection when the project changes.
  useEffect(() => {
    setSessionId(null);
    setActiveBimModelId(null);
    setSelected(new Set());
  }, [projectId]);

  // ── Sessions for the resume picker ───────────────────────────────────
  const sessionsQ = useQuery({
    enabled: !!projectId,
    queryKey: ['match-sessions', projectId],
    queryFn: () => matchElementsApi.listSessions(projectId!, { limit: 10 }),
  });

  // Auto-pick the most-recent active session that targets the chosen
  // BIM model. If none exists, leave the picker open so the user makes
  // an explicit choice.
  useEffect(() => {
    if (sessionId) return;
    const list = sessionsQ.data ?? [];
    if (list.length === 0) return;
    const matching = list.find(
      (s) =>
        !s.is_archived &&
        (activeBimModelId ? s.bim_model_id === activeBimModelId : true),
    );
    if (matching) setSessionId(matching.id);
  }, [sessionsQ.data, sessionId, activeBimModelId]);

  // ── Active session details ───────────────────────────────────────────
  const sessionQ = useQuery({
    enabled: !!sessionId,
    queryKey: ['match-session', sessionId],
    queryFn: () => matchElementsApi.getSession(sessionId!),
  });

  // ── Groups for the active session ────────────────────────────────────
  const groupsQ = useQuery({
    enabled: !!sessionId,
    queryKey: ['match-groups', sessionId, statusFilter],
    queryFn: () =>
      matchElementsApi.listGroups(sessionId!, {
        status: statusFilter || undefined,
        limit: 500,
      }),
  });

  // ── Attribute keys (drives the group-by chip-bar) ─────────────────────
  // Sampled from the bound BIM model — surfaces every attribute the user
  // can group by (ifc_class, type_name, family, material, level, …).
  const attributeKeysQ = useQuery({
    enabled: !!sessionId,
    queryKey: ['match-attributes', sessionId],
    queryFn: () => matchElementsApi.listAttributes(sessionId!),
    // Attribute keys are derived from the model — they don't change between
    // group-by toggles, so don't refetch on every PATCH.
    staleTime: 5 * 60_000,
  });

  // ── Mutations ────────────────────────────────────────────────────────
  const createSessionMut = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error('No active project');
      return matchElementsApi.createSession({
        project_id: projectId,
        bim_model_id: activeBimModelId,
        source: 'bim',
        // null = use server-side default subtractive set.
        excluded_categories: null,
      });
    },
    onSuccess: (s: MatchSession) => {
      setSessionId(s.id);
      qc.invalidateQueries({ queryKey: ['match-sessions', projectId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const updateSessionMut = useMutation({
    mutationFn: async (
      patch: Parameters<typeof matchElementsApi.updateSession>[1],
    ) => {
      if (!sessionId) throw new Error('No session');
      return matchElementsApi.updateSession(sessionId, patch);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['match-session', sessionId] });
      qc.invalidateQueries({ queryKey: ['match-groups', sessionId] });
    },
  });

  const runMatchMut = useMutation({
    mutationFn: async (method: MatcherName) => {
      if (!sessionId) throw new Error('No session');
      const keys = selected.size > 0 ? Array.from(selected) : undefined;
      setBusy(
        keys
          ? t(
              'match_elements.busy.run_selected',
              'Running {{method}} matcher on {{count}} selected…',
              { method, count: keys.length },
            )
          : t(
              'match_elements.busy.run_all',
              'Running {{method}} matcher on all groups…',
              { method },
            ),
      );
      return matchElementsApi.runMatch(sessionId, {
        method,
        top_k: 10,
        max_groups: 50,
        group_keys: keys,
      });
    },
    onSuccess: () => {
      setBusy(null);
      setError(null);
      qc.invalidateQueries({ queryKey: ['match-groups', sessionId] });
    },
    onError: (e: Error) => {
      setBusy(null);
      setError(e.message);
    },
  });

  const bulkConfirmMut = useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error('No session');
      const threshold = sessionQ.data?.auto_confirm_threshold ?? 0.95;
      const keys = selected.size > 0 ? Array.from(selected) : undefined;
      setBusy(
        keys
          ? t(
              'match_elements.busy.bulk_confirm_selected',
              'Bulk-confirming {{count}} selected ≥ {{thr}}…',
              { count: keys.length, thr: threshold.toFixed(2) },
            )
          : t(
              'match_elements.busy.bulk_confirm_all',
              'Bulk-confirming matches ≥ {{thr}}…',
              { thr: threshold.toFixed(2) },
            ),
      );
      return matchElementsApi.bulkConfirm(sessionId, {
        threshold,
        group_keys: keys,
      });
    },
    onSuccess: (r) => {
      setBusy(null);
      setError(null);
      qc.invalidateQueries({ queryKey: ['match-groups', sessionId] });
      qc.invalidateQueries({ queryKey: ['match-sessions', projectId] });
      setSelected(new Set());
      addToast({
        type: 'success',
        title: t('match_elements.alert.confirmed', 'Confirmed {{count}} groups', {
          count: r.confirmed_count,
        }),
      });
    },
    onError: (e: Error) => {
      setBusy(null);
      setError(e.message);
      addToast({
        type: 'error',
        title: t('match_elements.alert.bulk_confirm_failed', 'Bulk confirm failed'),
        message: e.message,
      });
    },
  });

  const applyMut = useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error('No session');
      setBusy(
        t(
          'match_elements.busy.applying',
          'Applying confirmed groups to BOQ…',
        ),
      );
      return matchElementsApi.apply(sessionId, { dry_run: false });
    },
    onSuccess: (r) => {
      setBusy(null);
      setError(null);
      qc.invalidateQueries({ queryKey: ['match-groups', sessionId] });
      qc.invalidateQueries({ queryKey: ['match-sessions', projectId] });
      addToast({
        type: 'success',
        title: t(
          'match_elements.alert.applied',
          'Created {{n}} BOQ positions · total {{total}} {{ccy}}',
          {
            n: r.positions_created,
            total: fmtNum(r.grand_total),
            ccy: r.currency ?? '',
          },
        ),
      });
    },
    onError: (e: Error) => {
      setBusy(null);
      setError(e.message);
      addToast({
        type: 'error',
        title: t('match_elements.alert.apply_failed', 'Apply to BOQ failed'),
        message: e.message,
      });
    },
  });

  const skipBulkMut = useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error('No session');
      const keys = Array.from(selected);
      setBusy(
        t('match_elements.busy.mark_tbd', 'Marking {{count}} groups as TBD…', {
          count: keys.length,
        }),
      );
      await Promise.all(
        keys.map((k) =>
          matchElementsApi.noMatch(sessionId, { group_key: k, action: 'tbd' }),
        ),
      );
      return keys.length;
    },
    onSuccess: (n) => {
      setBusy(null);
      qc.invalidateQueries({ queryKey: ['match-groups', sessionId] });
      setSelected(new Set());
      addToast({
        type: 'success',
        title: t('match_elements.alert.marked_tbd', 'Marked {{count}} groups as TBD', {
          count: n,
        }),
      });
    },
    onError: (e: Error) => {
      setBusy(null);
      setError(e.message);
      addToast({
        type: 'error',
        title: t('match_elements.alert.skip_failed', 'Skip failed'),
        message: e.message,
      });
    },
  });

  // Re-bind session to a different BIM model when the user picks a tab
  // and the active session targets a different (or no) model.
  const bindSessionToModelMut = useMutation({
    mutationFn: async (modelId: string) => {
      if (!sessionId) throw new Error('No session');
      return matchElementsApi.updateSession(sessionId, {
        bim_model_id: modelId,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['match-session', sessionId] });
      qc.invalidateQueries({ queryKey: ['match-groups', sessionId] });
    },
  });

  // ── Derived ──────────────────────────────────────────────────────────
  const summary = groupsQ.data?.summary ?? {};
  const visibleGroups = useMemo(() => {
    const all = groupsQ.data?.groups ?? [];
    if (tradeFilter.length === 0) return all;
    const set = new Set(tradeFilter);
    return all.filter((g) => set.has(g.trade));
  }, [groupsQ.data, tradeFilter]);

  const allVisibleSelected =
    visibleGroups.length > 0 &&
    visibleGroups.every((g) => selected.has(g.group_key));

  const toggleAll = () => {
    if (allVisibleSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visibleGroups.map((g) => g.group_key)));
    }
  };
  const toggleOne = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };

  // Primary CTA morphs depending on state.
  const confirmedCount = summary.confirmed ?? 0;
  const suggestedCount = summary.suggested ?? 0;
  const unmatchedCount = summary.unmatched ?? 0;
  const primaryCta: 'run' | 'confirm' | 'apply' | 'idle' = !sessionId
    ? 'idle'
    : suggestedCount === 0 && unmatchedCount > 0
      ? 'run'
      : confirmedCount > 0 && suggestedCount === 0
        ? 'apply'
        : suggestedCount > 0
          ? 'confirm'
          : 'run';

  // One pass over groups → counts per trade + per status. Avoids 8 filter
  // passes per render (one per trade) plus 3 separate filter passes for
  // the stepper. With 1000+ groups this dropped a tier-1 render from
  // ~12ms to ~2ms in DevTools.
  const groupAgg = useMemo(() => {
    const groups = groupsQ.data?.groups ?? [];
    const tradeCounts: Record<string, number> = {};
    let confirmed = 0;
    let applied = 0;
    for (const g of groups) {
      tradeCounts[g.trade] = (tradeCounts[g.trade] ?? 0) + 1;
      if (g.status === 'confirmed' || g.status === 'applied') confirmed += 1;
      if (g.status === 'applied') applied += 1;
    }
    return { total: groups.length, tradeCounts, confirmed, applied };
  }, [groupsQ.data?.groups]);

  const tradeChips: Chip<TradeBucket>[] = useMemo(
    () =>
      (
        [
          'architectural',
          'structural',
          'mep',
          'civil',
          'spatial',
          'subtractive',
          'annotation',
          'other',
        ] as const
      ).map((b) => ({
        value: b,
        label: t(`match_elements.trade.${b}`, b),
        count: groupAgg.tradeCounts[b] ?? 0,
      })),
    [groupAgg.tradeCounts, t],
  );

  const visibleSession = sessionQ.data;
  const threshold = visibleSession?.auto_confirm_threshold ?? 0.95;
  const useNet = visibleSession?.use_net_quantities ?? true;
  const stage: ConstructionStage | '' =
    visibleSession?.construction_stage ?? '';

  // ── Render ───────────────────────────────────────────────────────────
  // Derive workflow step (1-4) from current state to drive the step
  // indicator. Step transitions are intentionally one-way semaphores —
  // once you reach a step you stay until the prior signal goes missing.
  const stepperTotalGroups = groupAgg.total;
  const stepperConfirmedCount = groupAgg.confirmed;
  const stepperAppliedCount = groupAgg.applied;

  const workflowStep: 1 | 2 | 3 | 4 = !activeBimModelId
    ? 1
    : !sessionId
      ? 2
      : stepperAppliedCount > 0
        ? 4
        : 3;

  return (
    <div className="p-4 lg:p-6 max-w-[1600px] mx-auto">
      {/* Hero — page identity + primary actions, integrated step indicator */}
      <section className="relative overflow-hidden rounded-2xl border border-indigo-200/60 dark:border-indigo-800/60 bg-gradient-to-br from-indigo-50 via-white to-sky-50 dark:from-indigo-950/40 dark:via-surface-primary dark:to-sky-950/30 mb-4 shadow-sm">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 -top-20 w-72 h-72 rounded-full bg-gradient-to-br from-indigo-300/30 to-sky-300/20 dark:from-indigo-500/20 dark:to-sky-500/10 blur-3xl"
        />
        <div className="relative px-5 py-4 lg:px-6 lg:py-5 flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/70 dark:bg-surface-primary/60 border border-indigo-200/70 dark:border-indigo-700/50 text-[10px] uppercase tracking-wider font-semibold text-indigo-700 dark:text-indigo-200 mb-2 backdrop-blur-sm">
              <Sparkles className="w-3 h-3" />
              {t('match_elements.hero_eyebrow', 'BIM → BOQ')}
            </div>
            <h1 className="text-2xl lg:text-[28px] leading-tight font-semibold flex items-center gap-2.5 text-content-primary">
              <span className="shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
                <Link2 className="w-5 h-5" />
              </span>
              {t('match_elements.title', 'Match Elements')}
            </h1>
            <p className="text-sm text-content-secondary mt-1 max-w-[60ch]">
              {t(
                'match_elements.subtitle',
                'Map BIM elements to CWICR cost positions. Real geometry, real rates, real BOQ.',
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setTemplatesOpen(true)}
              aria-label={t(
                'match_elements.library_title',
                'Cross-project template library',
              )}
              className="px-3 py-2 text-sm rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white/80 dark:bg-surface-primary/80 hover:bg-white dark:hover:bg-surface-secondary backdrop-blur-sm inline-flex items-center gap-1.5 font-medium text-content-secondary hover:text-content-primary transition shadow-sm"
              title={t(
                'match_elements.library_title',
                'Cross-project template library',
              )}
            >
              <Library className="w-4 h-4" />
              {t('match_elements.library', 'Library')}
            </button>
            <button
              type="button"
              onClick={() =>
                qc.invalidateQueries({ queryKey: ['match-groups', sessionId] })
              }
              disabled={!sessionId}
              aria-label={t(
                'match_elements.refresh_title',
                'Refresh — pulls latest BIM elements',
              )}
              className="p-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white/80 dark:bg-surface-primary/80 hover:bg-white dark:hover:bg-surface-secondary backdrop-blur-sm disabled:opacity-40 disabled:cursor-not-allowed shadow-sm transition"
              title={t(
                'match_elements.refresh_title',
                'Refresh — pulls latest BIM elements',
              )}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
        {projectId && (
          <div className="relative px-5 lg:px-6 pb-4">
            <WorkflowStepIndicator
              step={workflowStep}
              totalGroups={stepperTotalGroups}
              confirmedCount={stepperConfirmedCount}
              appliedCount={stepperAppliedCount}
              hasModel={!!activeBimModelId}
              hasSession={!!sessionId}
            />
          </div>
        )}
      </section>

      <ProjectContextCard projectId={projectId} />

      {projectId && (
        <>
          {/* Free / open-source language model readiness — sits ABOVE
              Step 1 because if BGE-M3 is missing, semantic matching
              simply will not work, and the user should see the install
              path before investing time in picking a model. */}
          <div className="mt-4">
            <EmbedderStatusCard />
          </div>

          {/* §10 production observability — collapsible by default so it
              doesn't dominate the matching UX, but surfaces alerts (low
              top score, picked-rank>4, zero-hit with hard filter) right
              at the top when something needs attention. */}
          <div className="mt-3">
            <MatchAnalyticsCard projectId={projectId} />
          </div>

          {/* Step 1 — BIM model picker (one card per model in the project) */}
          <section className="mt-3 p-4 rounded-xl border border-border bg-surface-primary shadow-sm">
            <div className="flex items-baseline justify-between mb-2.5">
              <h3 className="text-xs uppercase tracking-wider text-content-tertiary font-semibold flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-md bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-200 inline-flex items-center justify-center text-[10px] font-bold">
                  1
                </span>
                {t('match_elements.region_bim_models', 'BIM model')}
              </h3>
              <span className="text-[11px] text-content-tertiary">
                {t(
                  'match_elements.region_bim_models_help',
                  'Pick the source model — quantities are read from here',
                )}
              </span>
            </div>
            <BIMModelPicker
              models={bimModelsQ.data ?? []}
              activeModelId={activeBimModelId}
              isLoading={bimModelsQ.isLoading}
              onSelect={(id) => {
                setActiveBimModelId(id);
                if (sessionId && visibleSession?.bim_model_id !== id) {
                  bindSessionToModelMut.mutate(id);
                }
              }}
            />
          </section>

          {/* Step 2 — Session resume picker */}
          <section className="mt-3 p-4 rounded-xl border border-border bg-surface-primary shadow-sm">
            <div className="flex items-baseline justify-between mb-2.5">
              <h3 className="text-xs uppercase tracking-wider text-content-tertiary font-semibold flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-md bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-200 inline-flex items-center justify-center text-[10px] font-bold">
                  2
                </span>
                {t('match_elements.region_sessions', 'Matching session')}
              </h3>
              <span className="text-[11px] text-content-tertiary">
                {t(
                  'match_elements.region_sessions_help',
                  'Resume an existing run or start a new one',
                )}
              </span>
            </div>
            <SessionPicker
              projectId={projectId}
              sessions={sessionsQ.data ?? []}
              isLoading={sessionsQ.isLoading}
              activeSessionId={sessionId}
              onPick={(id) => {
                setSessionId(id);
                matchElementsApi.touchSession(id).catch(() => {});
              }}
              onCreate={() => createSessionMut.mutate()}
              onCreateText={() => setShowTextModal(true)}
              onCreateExcel={() => setShowExcelModal(true)}
              isCreating={createSessionMut.isPending}
            />
          </section>

          {/* Step 3 — Group-by chip-bar (drives how elements are grouped) */}
          {sessionId && visibleSession && (
            <div className="mt-3 p-4 rounded-xl border border-border bg-surface-primary shadow-sm">
              <div className="flex items-baseline justify-between mb-2.5">
                <div className="text-xs uppercase tracking-wider text-content-tertiary font-semibold flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-md bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-200 inline-flex items-center justify-center text-[10px] font-bold">
                    3
                  </span>
                  {t('match_elements.group_by', 'Group by')}
                </div>
                <div className="text-[11px] text-content-tertiary">
                  {visibleSession.group_by.length === 0
                    ? t(
                        'match_elements.group_by_empty',
                        'Pick at least one attribute',
                      )
                    : t(
                        'match_elements.group_by_active',
                        '{{count}} active · click to toggle, drag to reorder',
                        { count: visibleSession.group_by.length },
                      )}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {/* Active keys first, in user-set order */}
                {visibleSession.group_by.map((k, idx) => (
                  <button
                    key={`active-${k}`}
                    type="button"
                    disabled={updateSessionMut.isPending}
                    onClick={() => {
                      if (updateSessionMut.isPending) return;
                      const next = visibleSession.group_by.filter(
                        (x) => x !== k,
                      );
                      updateSessionMut.mutate({ group_by: next });
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs bg-indigo-100 text-indigo-800 border border-indigo-300 dark:bg-indigo-900/40 dark:text-indigo-100 dark:border-indigo-500/60 hover:bg-indigo-200 dark:hover:bg-indigo-900/60 disabled:opacity-50 disabled:cursor-wait"
                    title={t(
                      'match_elements.group_by_remove',
                      'Click to remove from grouping',
                    )}
                  >
                    <span className="tabular-nums text-indigo-500 dark:text-indigo-300">
                      {idx + 1}.
                    </span>
                    <span>{k}</span>
                    <XCircle className="w-3 h-3 opacity-60" />
                  </button>
                ))}
                {/* Inactive keys (not yet in group_by) — split into popular + rest */}
                {(() => {
                  const inactive = (attributeKeysQ.data ?? []).filter(
                    (a: AttributeKey) => !visibleSession.group_by.includes(a.key),
                  );
                  const popular = inactive.filter((a) =>
                    POPULAR_GROUP_BY_KEYS.has(a.key),
                  );
                  const rest = inactive.filter(
                    (a) => !POPULAR_GROUP_BY_KEYS.has(a.key),
                  );
                  const renderChip = (a: AttributeKey) => (
                    <button
                      key={`inactive-${a.key}`}
                      type="button"
                      disabled={updateSessionMut.isPending}
                      onClick={() => {
                        if (updateSessionMut.isPending) return;
                        updateSessionMut.mutate({
                          group_by: [...visibleSession.group_by, a.key],
                        });
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-surface-primary text-content-secondary border border-border hover:border-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-200 disabled:opacity-50 disabled:cursor-wait"
                      title={
                        a.sample_values.length
                          ? `${t('match_elements.group_by_sample', 'e.g.')} ${a.sample_values.slice(0, 3).join(', ')}`
                          : undefined
                      }
                    >
                      <span>{a.key}</span>
                    </button>
                  );
                  return (
                    <>
                      {popular.map(renderChip)}
                      {showAllGroupKeys && rest.map(renderChip)}
                      {rest.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowAllGroupKeys((v) => !v)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs text-content-tertiary border border-dashed border-border hover:border-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-200"
                          title={t(
                            'match_elements.group_by_show_all_help',
                            'Tenant-specific attributes from this BIM model',
                          )}
                        >
                          {showAllGroupKeys
                            ? t('match_elements.group_by_show_less', 'Show less')
                            : t(
                                'match_elements.group_by_show_all',
                                'Show all ({{count}})',
                                { count: rest.length },
                              )}
                        </button>
                      )}
                    </>
                  );
                })()}
                {!attributeKeysQ.data && (
                  <span className="text-xs text-content-tertiary px-2 py-1">
                    <Loader2 className="w-3 h-3 inline animate-spin mr-1" />
                    {t('match_elements.loading_attributes', 'Loading…')}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Step 4 — Settings rail. Two visual groups:
           *   • Match strategy  — threshold + net/gross + stage (drives the matcher)
           *   • Filters        — trade buckets (drives what's visible) */}
          {sessionId && visibleSession && (
            <section className="mt-3 p-4 rounded-xl border border-border bg-surface-primary shadow-sm">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-xs uppercase tracking-wider text-content-tertiary font-semibold flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-md bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-200 inline-flex items-center justify-center text-[10px] font-bold">
                    4
                  </span>
                  {t('match_elements.region_settings', 'Match settings')}
                </h3>
                <span className="text-[11px] text-content-tertiary">
                  {t(
                    'match_elements.region_settings_help',
                    'Tune how matches are found and what shows up below',
                  )}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                <Slider
                  label={t(
                    'match_elements.auto_confirm_threshold',
                    'Auto-confirm threshold',
                  )}
                  description={t(
                    'match_elements.auto_confirm_help',
                    'Suggested matches at or above this score auto-confirm.',
                  )}
                  value={threshold}
                  onChange={(v) =>
                    updateSessionMut.mutate({ auto_confirm_threshold: v })
                  }
                  min={0.5}
                  max={1.0}
                  step={0.01}
                  format={(v) => v.toFixed(2)}
                />
                <Toggle
                  checked={useNet}
                  onChange={(v) =>
                    updateSessionMut.mutate({ use_net_quantities: v })
                  }
                  label={t(
                    'match_elements.use_net',
                    'Use net quantities (deduct openings)',
                  )}
                  description={t(
                    'match_elements.use_net_help',
                    'Off = use gross. Default deducts IfcOpeningElement / IfcRelVoidsElement from host quantities.',
                  )}
                />
                <div>
                  <label
                    htmlFor="match-elements-stage"
                    className="text-xs uppercase tracking-wider text-content-tertiary mb-1.5 block font-medium"
                  >
                    {t('match_elements.stage_label', 'Construction stage')}
                  </label>
                  <select
                    id="match-elements-stage"
                    value={stage}
                    disabled={updateSessionMut.isPending}
                    onChange={(e) => {
                      const v = e.target.value as ConstructionStage | '';
                      updateSessionMut.mutate({
                        construction_stage: v === '' ? null : v,
                      });
                    }}
                    className="w-full text-sm rounded border border-border bg-surface-primary text-content-primary px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-oe-blue/40 disabled:opacity-50"
                  >
                    <option value="">
                      {t('match_elements.stage_any', 'Any stage')}
                    </option>
                    {CONSTRUCTION_STAGES.map((s) => (
                      <option key={s} value={s}>
                        {t(`match_elements.stage.${s}`, s)}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-content-tertiary mt-1 leading-snug">
                    {t(
                      'match_elements.stage_help',
                      'Pin matches to one OmniClass-aligned phase. Leave blank to search all stages.',
                    )}
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-border-light">
                <div className="text-xs uppercase tracking-wider text-content-tertiary mb-2 font-medium">
                  {t('match_elements.trade_filter', 'Filter by trade')}
                </div>
                <ChipBar<TradeBucket>
                  chips={tradeChips}
                  selected={tradeFilter}
                  onToggle={(v) =>
                    setTradeFilter((prev) =>
                      prev.includes(v)
                        ? prev.filter((x) => x !== v)
                        : [...prev, v],
                    )
                  }
                  onClear={() => setTradeFilter([])}
                  size="sm"
                />
              </div>
            </section>
          )}

          {/* Status counters */}
          {sessionId && (
            <div className="flex items-center gap-3 mt-4 mb-3 flex-wrap">
              {(['unmatched', 'suggested', 'confirmed', 'skipped', 'tbd', 'applied'] as const).map(
                (k) => (
                  <button
                    key={k}
                    onClick={() => setStatusFilter(statusFilter === k ? '' : k)}
                    className={`px-2.5 py-1 rounded text-xs border transition ${
                      statusFilter === k
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-500 dark:text-indigo-200'
                        : 'bg-surface-primary border-border text-content-secondary hover:border-border'
                    }`}
                  >
                    {t(`match_elements.status.${k}`, k)}:{' '}
                    <strong className="ml-1 tabular-nums">
                      {summary[k] ?? 0}
                    </strong>
                  </button>
                ),
              )}
              {statusFilter && (
                <button
                  onClick={() => setStatusFilter('')}
                  className="text-xs text-content-tertiary underline"
                >
                  {t('match_elements.clear_filter', 'clear filter')}
                </button>
              )}
              <div className="ml-auto">
                {groupsQ.data && (
                  <ConfidenceLegend
                    high={groupsQ.data.confidence_high_threshold}
                    medium={groupsQ.data.confidence_medium_threshold}
                  />
                )}
              </div>
            </div>
          )}

          {/* Region 4 — Action toolbar */}
          {sessionId && (
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <button
                onClick={() => runMatchMut.mutate('vector')}
                disabled={!sessionId || !!busy}
                className={`px-3 py-1.5 text-sm rounded text-white disabled:opacity-50 inline-flex items-center gap-1.5 ${
                  primaryCta === 'run'
                    ? 'bg-indigo-600 hover:bg-indigo-700 ring-2 ring-indigo-300 dark:ring-indigo-700'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                <Search className="w-4 h-4" />
                {selected.size > 0
                  ? t(
                      'match_elements.action.vector_selected',
                      'Vector match ({{count}})',
                      { count: selected.size },
                    )
                  : t(
                      'match_elements.action.vector_all',
                      'Vector match — top 10',
                    )}
              </button>
              <button
                onClick={() => runMatchMut.mutate('lexical')}
                disabled={!sessionId || !!busy}
                className="px-3 py-1.5 text-sm rounded bg-slate-700 hover:bg-slate-800 text-white disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <Search className="w-4 h-4" />
                {selected.size > 0
                  ? t(
                      'match_elements.action.lexical_selected',
                      'Lexical ({{count}})',
                      { count: selected.size },
                    )
                  : t(
                      'match_elements.action.lexical_all',
                      'Lexical match — top 10',
                    )}
              </button>
              <button
                onClick={() => runMatchMut.mutate('resources')}
                disabled={!sessionId || !!busy}
                className="px-3 py-1.5 text-sm rounded bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50 inline-flex items-center gap-1.5"
                title={t(
                  'match_elements.action.resources_title',
                  'Match against the materials/resources catalogue',
                )}
              >
                <Search className="w-4 h-4" />
                {selected.size > 0
                  ? t(
                      'match_elements.action.resources_selected',
                      'Resources ({{count}})',
                      { count: selected.size },
                    )
                  : t(
                      'match_elements.action.resources_all',
                      'Match resources — top 10',
                    )}
              </button>
              <span className="w-px h-6 bg-border mx-1" />
              <button
                onClick={() => bulkConfirmMut.mutate()}
                disabled={!sessionId || !!busy}
                className={`px-3 py-1.5 text-sm rounded text-white disabled:opacity-50 inline-flex items-center gap-1.5 ${
                  primaryCta === 'confirm'
                    ? 'bg-emerald-600 hover:bg-emerald-700 ring-2 ring-emerald-300 dark:ring-emerald-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                {selected.size > 0
                  ? t(
                      'match_elements.action.confirm_selected',
                      'Confirm {{count}} ≥ {{thr}}',
                      { count: selected.size, thr: threshold.toFixed(2) },
                    )
                  : t(
                      'match_elements.action.confirm_all',
                      'Confirm all ≥ {{thr}}',
                      { thr: threshold.toFixed(2) },
                    )}
              </button>
              <button
                onClick={() => applyMut.mutate()}
                disabled={!sessionId || !!busy || confirmedCount === 0}
                className={`px-3 py-1.5 text-sm rounded text-white disabled:opacity-50 inline-flex items-center gap-1.5 ${
                  primaryCta === 'apply'
                    ? 'bg-blue-600 hover:bg-blue-700 ring-2 ring-blue-300 dark:ring-blue-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
                title={t(
                  'match_elements.action.apply_title',
                  'Write confirmed matches to the project BOQ',
                )}
              >
                <PlayCircle className="w-4 h-4" />
                {t('match_elements.action.apply', 'Apply to BOQ ({{n}})', {
                  n: confirmedCount,
                })}
              </button>
              {selected.size > 0 && (
                <>
                  <button
                    onClick={() => skipBulkMut.mutate()}
                    disabled={!sessionId || !!busy}
                    className="px-3 py-1.5 text-sm rounded border border-rose-300 text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:hover:bg-rose-900/20 disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    {t('match_elements.action.skip_n', 'Skip {{count}} (TBD)', {
                      count: selected.size,
                    })}
                  </button>
                  <button
                    onClick={() => setSelected(new Set())}
                    className="text-xs text-content-tertiary underline ml-1"
                  >
                    {t('match_elements.clear_selection', 'clear selection')}
                  </button>
                </>
              )}
              <span className="text-xs text-content-tertiary ml-auto">
                {sessionId && (
                  <span>
                    <ChevronsRight className="w-3 h-3 inline" />{' '}
                    {t('match_elements.session_id', 'Session {{id}}…', {
                      id: sessionId.slice(0, 8),
                    })}
                  </span>
                )}
              </span>
            </div>
          )}

          {busy && !error && (
            <div
              className="mb-3 px-3 py-2 rounded bg-slate-100 dark:bg-slate-800 text-sm flex items-center gap-2"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              {busy}
            </div>
          )}
          {error && (
            <div
              className="mb-3 px-3 py-2 rounded border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20 text-sm text-rose-800 dark:text-rose-100 flex items-start gap-2"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0 break-words">{error}</div>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-xs underline opacity-80 hover:opacity-100 shrink-0"
              >
                {t('match_elements.error_dismiss', 'Dismiss')}
              </button>
            </div>
          )}

          {/* Region 6 — Group list */}
          {sessionId && (
            <div className="border border-border rounded-lg overflow-hidden bg-surface-primary">
              {/* select-all header (separate so it stays in sync with table) */}
              <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border-b border-border flex items-center gap-2 text-xs text-content-tertiary">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAll}
                  aria-label={t(
                    'match_elements.aria.select_all',
                    'Select all visible groups',
                  )}
                />
                <span>
                  {t('match_elements.visible_groups', '{{n}} visible', {
                    n: visibleGroups.length,
                  })}
                  {selected.size > 0 && (
                    <span>
                      {' '}
                      ·{' '}
                      {t(
                        'match_elements.selected_count',
                        '{{n}} selected',
                        { n: selected.size },
                      )}
                    </span>
                  )}
                </span>
              </div>
              <div className="overflow-auto max-h-[60vh] sm:max-h-[calc(100vh-360px)]">
                <GroupListBody
                  groups={visibleGroups}
                  isLoading={groupsQ.isLoading}
                  selected={selected}
                  onToggleOne={toggleOne}
                  onOpenDetail={setOpenGroup}
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* Slide-over detail */}
      {openGroup && sessionId && (
        <MatchDetailPanel
          sessionId={sessionId}
          group={openGroup}
          onClose={() => setOpenGroup(null)}
        />
      )}
      {templatesOpen && (
        <TemplatesPanel onClose={() => setTemplatesOpen(false)} />
      )}
      {showTextModal && projectId && (
        <NewSessionFromTextModal
          projectId={projectId}
          onClose={() => setShowTextModal(false)}
          onCreated={(session) => {
            setShowTextModal(false);
            setSessionId(session.id);
          }}
        />
      )}
      {showExcelModal && projectId && (
        <NewSessionFromExcelModal
          projectId={projectId}
          onClose={() => setShowExcelModal(false)}
          onCreated={(session) => {
            setShowExcelModal(false);
            setSessionId(session.id);
          }}
        />
      )}
    </div>
  );
}
