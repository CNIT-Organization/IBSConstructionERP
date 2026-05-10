// DDC-CWICR-OE: DataDrivenConstruction · OpenConstructionERP
// Copyright (c) 2026 Artem Boiko / DataDrivenConstruction
//
// Slide-over detail panel for a single match group.
// 3 tabs: Elements · Method comparison · Apply preview.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, CheckCircle2, ChevronRight, Loader2, AlertCircle, XCircle } from 'lucide-react';
import {
  matchElementsApi,
  type ConfidenceBand,
  type GroupSummary,
  type MatchCandidate,
} from './api';
import { NoMatchModal } from './NoMatchModal';

interface Props {
  sessionId: string;
  group: GroupSummary | null;
  onClose: () => void;
}

function ConfidencePill({ band, score }: { band: ConfidenceBand; score: number }) {
  const cls =
    band === 'high'
      ? 'bg-emerald-500'
      : band === 'medium'
        ? 'bg-amber-500'
        : band === 'low'
          ? 'bg-rose-500'
          : 'bg-slate-400';
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-white text-xs ${cls}`}>
      {score.toFixed(2)}
    </span>
  );
}

export function MatchDetailPanel({ sessionId, group, onClose }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'elements' | 'methods' | 'apply'>('methods');
  const [noMatchOpen, setNoMatchOpen] = useState(false);

  const detailQ = useQuery({
    enabled: !!group,
    queryKey: ['match-detail', sessionId, group?.group_key],
    queryFn: () => matchElementsApi.getGroup(sessionId, group!.group_key),
  });

  const applyQ = useQuery({
    enabled: !!group && tab === 'apply',
    queryKey: ['match-apply-preview', sessionId, group?.group_key],
    queryFn: () =>
      matchElementsApi.apply(sessionId, {
        dry_run: true,
        group_keys: [group!.group_key],
      }),
  });

  const confirmMut = useMutation({
    mutationFn: async (cand: MatchCandidate) => {
      if (!group) throw new Error('no group');
      return matchElementsApi.confirm(sessionId, {
        group_key: group.group_key,
        candidate_id: cand.id,
        method: 'manual',
        confidence: cand.score,
        save_to_template_library: true,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['match-groups', sessionId] });
      qc.invalidateQueries({ queryKey: ['match-detail', sessionId] });
    },
  });

  const methods = detailQ.data?.methods ?? {};
  const methodNames = useMemo(
    () => Object.keys(methods).filter((k) => (methods[k] ?? []).length > 0),
    [methods],
  );

  // Escape closes the slide-over (parent listens for Escape too — this
  // ensures the inner panel handles it first when the user is focused
  // inside the table or footer). Only attaches while a group is active.
  useEffect(() => {
    if (!group) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !noMatchOpen) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [group, noMatchOpen, onClose]);

  if (!group) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
        aria-hidden
      />

      {/* Slide-over */}
      <aside className="fixed top-0 right-0 bottom-0 w-full sm:w-[680px] bg-white dark:bg-slate-900 z-50 shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-700">
        <header className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <div
              className="text-sm font-semibold truncate"
              title={group.group_key}
            >
              {group.display_label || group.group_key}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {t('match_elements.detail.elements_count', '{{count}} elements', {
                count: group.element_count,
              })}{' '}
              · {Object.entries(group.quantities).slice(0, 3).map(
                ([k, v]) => `${k}=${(v as number).toFixed(1)}`,
              ).join(' · ')}
              {group.opening_warning && (
                <span className="ml-2 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <AlertCircle className="w-3 h-3" />
                  {t(
                    'match_elements.detail.opening_warning',
                    'host has openings but gross == net (IFC export bug)',
                  )}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('match_elements.detail.close', 'Close detail panel')}
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <nav
          className="px-4 border-b border-slate-200 dark:border-slate-700 flex gap-1"
          role="tablist"
          aria-label={t('match_elements.detail.tabs_label', 'Detail panel sections')}
        >
          {(['methods', 'elements', 'apply'] as const).map((tabKey) => (
            <button
              key={tabKey}
              type="button"
              role="tab"
              id={`detail-tab-${tabKey}`}
              aria-selected={tab === tabKey}
              aria-controls={`detail-tabpanel-${tabKey}`}
              tabIndex={tab === tabKey ? 0 : -1}
              onClick={() => setTab(tabKey)}
              className={`px-3 py-2 text-sm border-b-2 transition ${
                tab === tabKey
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-300'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {tabKey === 'methods'
                ? t('match_elements.tab.methods', 'Match candidates')
                : tabKey === 'elements'
                ? t('match_elements.tab.elements', 'Elements ({{count}})', { count: group.element_count })
                : t('match_elements.tab.apply', 'Apply preview')}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-auto p-4">
          {detailQ.isLoading && (
            <div className="text-center text-slate-500 py-8">
              <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
              {t('match_elements.loading_detail', 'Loading detail…')}
            </div>
          )}

          {detailQ.isError && !detailQ.isLoading && (
            <div
              className="rounded border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20 px-3 py-3 text-sm text-rose-800 dark:text-rose-100 flex items-start gap-2"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold">
                  {t('match_elements.detail.error_title', 'Could not load detail')}
                </div>
                <div className="text-xs mt-0.5 break-all opacity-80">
                  {String((detailQ.error as Error | null)?.message ?? detailQ.error ?? '')}
                </div>
                <button
                  type="button"
                  onClick={() => detailQ.refetch()}
                  className="mt-1.5 text-xs underline hover:opacity-80"
                >
                  {t('match_elements.detail.retry', 'Retry')}
                </button>
              </div>
            </div>
          )}

          {/* Tab: methods */}
          {tab === 'methods' && detailQ.data && (
            <div role="tabpanel" id="detail-tabpanel-methods" aria-labelledby="detail-tab-methods">
              {methodNames.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                  <AlertCircle className="w-6 h-6 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">{t('match_elements.detail.no_matchers_run', 'No matchers run yet for this group.')}</p>
                  <p className="text-xs mt-1">{t('match_elements.detail.use_action_bar', 'Use the action bar buttons above.')}</p>
                </div>
              )}
              {methodNames.map((name) => (
                <div key={name} className="mb-6">
                  <h3 className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                    {name}
                  </h3>
                  <table className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded">
                    <thead className="bg-slate-50 dark:bg-slate-800">
                      <tr>
                        <th className="text-left px-2 py-1.5 font-medium">{t('match_elements.detail.col.code', 'Code')}</th>
                        <th className="text-left px-2 py-1.5 font-medium">{t('match_elements.detail.col.description', 'Description')}</th>
                        <th className="text-right px-2 py-1.5 font-medium">{t('match_elements.detail.col.unit_rate', 'Unit · Rate')}</th>
                        <th className="text-right px-2 py-1.5 font-medium">{t('match_elements.detail.col.conf', 'Conf.')}</th>
                        <th className="text-right px-2 py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(methods[name] ?? []).slice(0, 10).map((cand, idx) => (
                        <tr
                          key={`${name}-${cand.code}-${idx}`}
                          className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                        >
                          <td className="px-2 py-1.5 font-mono text-xs">{cand.code}</td>
                          <td className="px-2 py-1.5 text-xs">{cand.description}</td>
                          <td className="px-2 py-1.5 text-right text-xs tabular-nums">
                            {cand.unit_rate.toFixed(2)} {cand.currency}/{cand.unit}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <ConfidencePill band={cand.confidence_band} score={cand.score} />
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <button
                              onClick={() => confirmMut.mutate(cand)}
                              disabled={confirmMut.isPending || !cand.id}
                              title={
                                !cand.id
                                  ? t(
                                      'match_elements.detail.candidate_no_id',
                                      'Candidate has no DB id — cannot confirm',
                                    )
                                  : undefined
                              }
                              className="px-2 py-0.5 text-xs rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                            >
                              {t('match_elements.detail.confirm', 'Confirm')}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}

          {/* Tab: elements */}
          {tab === 'elements' && detailQ.data && (
            <div role="tabpanel" id="detail-tabpanel-elements" aria-labelledby="detail-tab-elements">
              <p className="text-xs text-slate-500 mb-2">
                {t('match_elements.detail.element_ids_count', '{{count}} element id(s)', { count: detailQ.data.element_ids.length })}
              </p>
              <div className="font-mono text-xs leading-tight max-h-[60vh] overflow-auto bg-slate-50 dark:bg-slate-800 p-2 rounded">
                {detailQ.data.element_ids.slice(0, 200).map((id) => (
                  <div key={id} className="truncate text-slate-600 dark:text-slate-300">{id}</div>
                ))}
                {detailQ.data.element_ids.length > 200 && (
                  <div className="text-slate-500">{t('match_elements.detail.and_more', '…and {{count}} more', { count: detailQ.data.element_ids.length - 200 })}</div>
                )}
              </div>
            </div>
          )}

          {/* Tab: apply preview */}
          {tab === 'apply' && (
            <div role="tabpanel" id="detail-tabpanel-apply" aria-labelledby="detail-tab-apply">
              {applyQ.isLoading && (
                <div className="text-center text-slate-500 py-8">
                  <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                  {t('match_elements.detail.building_preview', 'Building preview…')}
                </div>
              )}
              {applyQ.data && (
                <div className="mb-3 px-3 py-2 rounded bg-slate-50 dark:bg-slate-800 text-sm flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-300">
                    {t('match_elements.detail.apply_total', 'Total')}
                  </span>
                  <strong className="tabular-nums">
                    {applyQ.data.grand_total.toFixed(2)}{' '}
                    {applyQ.data.currency ?? ''}
                  </strong>
                </div>
              )}
              {applyQ.data && applyQ.data.positions.map((p) => (
                <div key={p.group_key} className="mb-4 border border-slate-200 dark:border-slate-700 rounded p-3">
                  <div className="text-xs text-slate-500 mb-1">{p.section_path.join(' → ')}</div>
                  <div className="font-medium text-sm">{p.description}</div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                    {p.quantity.toFixed(2)} {p.unit} × {p.unit_rate.toFixed(2)} {p.currency} ={' '}
                    <strong className="tabular-nums">{p.line_total.toFixed(2)} {p.currency}</strong>
                  </div>
                  {p.resources.length > 0 && (
                    <div className="mt-2 pl-3 border-l-2 border-slate-200 dark:border-slate-700">
                      <div className="text-xs text-slate-500 mb-1">{t('match_elements.detail.auto_loaded_resources', 'Auto-loaded resources:')}</div>
                      {p.resources.map((r, i) => (
                        <div key={i} className="text-xs flex justify-between text-slate-600 dark:text-slate-300">
                          <span>{r.description} (×{r.factor})</span>
                          <span className="tabular-nums">{r.quantity.toFixed(2)} {r.unit}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {applyQ.data && applyQ.data.positions.length === 0 && (
                <div className="text-center text-slate-500 py-8 text-sm">
                  {t('match_elements.detail.confirm_first', 'Confirm a match first to see the BOQ preview.')}
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <button
            onClick={() => setNoMatchOpen(true)}
            className="text-xs text-slate-600 hover:text-rose-600 inline-flex items-center gap-1"
          >
            <XCircle className="w-3.5 h-3.5" />
            {t('match_elements.no_match', 'No match…')}
          </button>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            {t('match_elements.col.status', 'Status')}: <strong>{t(`match_elements.status.${group.status}`, group.status)}</strong>
            <ChevronRight className="w-3 h-3" />
            <CheckCircle2 className={`w-4 h-4 ${group.status === 'confirmed' ? 'text-emerald-500' : 'text-slate-300'}`} />
          </div>
        </footer>
      </aside>

      {noMatchOpen && (
        <NoMatchModal
          sessionId={sessionId}
          groupKey={group.group_key}
          onClose={() => setNoMatchOpen(false)}
          onDone={() => {
            setNoMatchOpen(false);
            onClose();
          }}
        />
      )}
    </>
  );
}
