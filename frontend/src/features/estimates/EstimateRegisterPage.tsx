/**
 * PWD Delhi — Estimate Register
 * Stages: Rough → PE → AA/ES → DE → T/S → NIT
 * Officer-simple stage advance + Abstract/SOQ export + Sanction notes.
 * Demo Planning vs Engineer wing switcher (localStorage — not prod RBAC).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronRight,
  ClipboardList,
  Download,
  FilePlus2,
  FolderOpen,
  Printer,
  Scale,
  Search,
  Table2,
} from 'lucide-react';
import { Badge, Breadcrumb, Button, Card, ConfirmDialog, EmptyState } from '@/shared/ui';
import { apiGet } from '@/shared/lib/api';
import { DateDisplay } from '@/shared/ui/DateDisplay';
import { useToastStore } from '@/stores/useToastStore';
import {
  ESTIMATE_STAGE_LABELS,
  ESTIMATE_STAGES,
  type EstimateRegisterItem,
  type EstimateSanctionNotes,
  type EstimateStage,
} from './types';
import { formatInr } from './peCompute';
import {
  advanceEstimateStage,
  advanceRoleHint,
  advanceToDE,
  loadRegister,
  nextStage,
  saveSanctionNotes,
  stageFromBoqStatus,
} from './estimateStore';
import {
  abstractPayloadForRegisterItem,
  downloadAbstractCsv,
  downloadSOQCsv,
  printAbstractOfCost,
  printSOQ,
  soqStateForRegisterItem,
} from './estimateExport';
import {
  mergeBoqRowWithMetadata,
  queueSyncEstimateToBoq,
} from './estimateApiSync';
import {
  advanceBlockedReason,
  aaEsNoteBlockedReason,
  canAdvanceFromStage,
  canCreateOrEditDE,
  canCreateOrEditPE,
  canEditAaEsNote,
  canEditTsSanctionNotes,
  deEditBlockedReason,
  peEditBlockedReason,
  tsSanctionBlockedReason,
} from './demoRoles';
import { DemoRoleSwitcher, RoleGate, useDemoWingRole } from './DemoRoleSwitcher';

interface ProjectRow {
  id: string;
  name: string;
}

interface BoqRow {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  status: string;
  grand_total?: number;
  updated_at?: string;
  created_at?: string;
  metadata?: Record<string, unknown> | null;
}

function stageBadgeVariant(
  stage: EstimateStage,
): 'neutral' | 'blue' | 'success' | 'warning' | 'error' {
  switch (stage) {
    case 'rough':
      return 'neutral';
    case 'pe':
      return 'blue';
    case 'aa_es':
      return 'warning';
    case 'de':
      return 'blue';
    case 'ts':
      return 'warning';
    case 'nit':
      return 'success';
    default:
      return 'neutral';
  }
}

export function EstimateRegisterPage() {
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);
  const [demoRole] = useDemoWingRole();
  const [items, setItems] = useState<EstimateRegisterItem[]>(() => loadRegister());
  const [stageFilter, setStageFilter] = useState<EstimateStage | 'all'>('all');
  const [search, setSearch] = useState('');
  const [advanceTarget, setAdvanceTarget] = useState<EstimateRegisterItem | null>(null);
  const [sanctionTarget, setSanctionTarget] = useState<EstimateRegisterItem | null>(null);
  const [sanctionForm, setSanctionForm] = useState<EstimateSanctionNotes>({
    aaEsNote: '',
    tsNote: '',
    powerNote: '',
  });

  const refresh = useCallback(() => {
    setItems(loadRegister());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const { data: projects } = useQuery({
    queryKey: ['pwd-estimates-projects'],
    queryFn: () => apiGet<ProjectRow[]>('/v1/projects/'),
    staleTime: 60_000,
    retry: false,
  });

  const { data: boqDerived } = useQuery({
    queryKey: ['pwd-estimates-boq-merge', projects?.map((p) => p.id).join(',')],
    enabled: !!projects && projects.length > 0,
    queryFn: async () => {
      const projectMap = new Map(projects!.map((p) => [p.id, p.name]));
      const chunks = await Promise.all(
        projects!.slice(0, 12).map(async (p) => {
          try {
            const boqs = await apiGet<BoqRow[]>(`/v1/boq/boqs/?project_id=${p.id}`);
            return boqs.map((b) =>
              mergeBoqRowWithMetadata(
                b,
                projectMap.get(b.project_id) || 'Project',
                stageFromBoqStatus,
                { persistHydrated: true },
              ),
            );
          } catch {
            return [] as EstimateRegisterItem[];
          }
        }),
      );
      return chunks.flat();
    },
    staleTime: 60_000,
    retry: false,
  });

  useEffect(() => {
    if (boqDerived && boqDerived.length > 0) {
      refresh();
    }
  }, [boqDerived, refresh]);

  const merged = useMemo(() => {
    const byId = new Map<string, EstimateRegisterItem>();
    for (const row of items) byId.set(row.id, row);
    for (const row of boqDerived ?? []) {
      if (!byId.has(row.id)) byId.set(row.id, row);
    }
    return Array.from(byId.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }, [items, boqDerived]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: merged.length };
    for (const s of ESTIMATE_STAGES) counts[s] = 0;
    for (const row of merged) {
      counts[row.stage] = (counts[row.stage] ?? 0) + 1;
    }
    return counts;
  }, [merged]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return merged.filter((row) => {
      if (stageFilter !== 'all' && row.stage !== stageFilter) return false;
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        row.projectName.toLowerCase().includes(q) ||
        row.workDescription.toLowerCase().includes(q)
      );
    });
  }, [merged, stageFilter, search]);

  const openPE = (row: EstimateRegisterItem) => {
    // Viewing PE is allowed for both; create/edit gated on PE page + New PE.
    navigate(`/estimates/pe/${row.id}`);
  };

  const openDE = (row: EstimateRegisterItem) => {
    // Opening DE for view is allowed; deep-edit gated on DE page.
    // Only Engineer may create a skeleton DE when advancing from PE/AA-ES.
    if ((row.stage === 'aa_es' || row.stage === 'pe') && !row.deDraft) {
      if (!canCreateOrEditDE(demoRole)) {
        addToast({
          type: 'warning',
          title: 'DE create blocked',
          message: deEditBlockedReason(demoRole) ?? '',
        });
        navigate(`/estimates/${row.id}/de`);
        return;
      }
      const advanced = advanceToDE(row.id);
      queueSyncEstimateToBoq(advanced);
      refresh();
    }
    navigate(`/estimates/${row.id}/de`);
  };

  const openEstimate = (row: EstimateRegisterItem) => {
    if (row.stage === 'de' || row.deDraft) {
      openDE(row);
      return;
    }
    if (row.peDraft || row.stage === 'pe' || row.stage === 'rough') {
      openPE(row);
      return;
    }
    if (row.stage === 'aa_es') {
      openDE(row);
      return;
    }
    if (row.boqId) {
      navigate(`/boq/${row.boqId}`);
      return;
    }
    openPE(row);
  };

  const confirmAdvance = () => {
    if (!advanceTarget) return;
    const from = advanceTarget.stage;
    const blocked = advanceBlockedReason(demoRole, from);
    if (blocked) {
      addToast({ type: 'warning', title: 'Advance blocked (demo role)', message: blocked });
      setAdvanceTarget(null);
      return;
    }
    const nxt = nextStage(from);
    const updated = advanceEstimateStage(advanceTarget.id);
    setAdvanceTarget(null);
    queueSyncEstimateToBoq(updated);
    refresh();
    if (updated && nxt) {
      addToast({
        type: 'success',
        title: `Stage → ${ESTIMATE_STAGE_LABELS[nxt]}`,
        message: `${updated.name} · ${advanceRoleHint(from)} advance`,
      });
    }
  };

  const openSanction = (row: EstimateRegisterItem) => {
    setSanctionTarget(row);
    setSanctionForm({
      aaEsNote: row.sanction?.aaEsNote ?? '',
      tsNote: row.sanction?.tsNote ?? '',
      powerNote: row.sanction?.powerNote ?? '',
    });
  };

  const saveSanction = () => {
    if (!sanctionTarget) return;
    // Merge only fields this demo wing may edit — never wipe the other wing's notes.
    const existing = sanctionTarget.sanction;
    const nextNotes: EstimateSanctionNotes = {
      aaEsNote: canEditAaEsNote(demoRole)
        ? sanctionForm.aaEsNote
        : (existing?.aaEsNote ?? ''),
      tsNote: canEditTsSanctionNotes(demoRole)
        ? sanctionForm.tsNote
        : (existing?.tsNote ?? ''),
      powerNote: canEditTsSanctionNotes(demoRole)
        ? sanctionForm.powerNote
        : (existing?.powerNote ?? ''),
    };
    if (!canEditAaEsNote(demoRole) && !canEditTsSanctionNotes(demoRole)) {
      addToast({
        type: 'warning',
        title: 'Sanction blocked',
        message: 'No editable sanction fields for this demo role.',
      });
      return;
    }
    const saved = saveSanctionNotes(sanctionTarget.id, nextNotes);
    setSanctionTarget(null);
    queueSyncEstimateToBoq(saved);
    refresh();
    addToast({
      type: 'success',
      title: 'Sanction notes saved',
      message: sanctionTarget.name,
    });
  };

  const exportAbstract = (row: EstimateRegisterItem, mode: 'print' | 'csv') => {
    const payload = abstractPayloadForRegisterItem(row);
    if (!payload) {
      addToast({
        type: 'warning',
        title: 'No abstract',
        message: 'Open PE or DE first to build an Abstract of Cost.',
      });
      return;
    }
    if (mode === 'print') printAbstractOfCost(payload);
    else downloadAbstractCsv(payload);
    addToast({
      type: 'success',
      title: mode === 'print' ? 'Abstract print window' : 'Abstract CSV downloaded',
      message: `PWD_Delhi_Abstract_${row.name.slice(0, 24)}…`,
    });
  };

  const exportSOQ = (row: EstimateRegisterItem, mode: 'print' | 'csv') => {
    const de = soqStateForRegisterItem(row);
    if (!de || de.lines.length === 0) {
      addToast({
        type: 'warning',
        title: 'No SOQ lines',
        message: 'Open DE and add DSR/NS lines before exporting SOQ.',
      });
      return;
    }
    if (mode === 'print') printSOQ(de);
    else downloadSOQCsv(de);
    addToast({
      type: 'success',
      title: mode === 'print' ? 'SOQ print window' : 'SOQ CSV downloaded',
      message: `PWD_Delhi_SOQ · ${de.lines.length} lines`,
    });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <Breadcrumb
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Estimates' },
        ]}
        className="mb-4"
      />

      <DemoRoleSwitcher />

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#0B3A6E]">
            Estimate Register
          </h1>
          <p className="mt-1 text-sm text-content-secondary">
            अनुमान पंजी · Rough → PE → AA/ES → DE → T/S → NIT
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <RoleGate blocked={!canCreateOrEditPE(demoRole)} reason={peEditBlockedReason(demoRole)}>
            <Button
              variant="primary"
              icon={<FilePlus2 className="h-4 w-4" />}
              disabled={!canCreateOrEditPE(demoRole)}
              onClick={() => {
                if (!canCreateOrEditPE(demoRole)) {
                  addToast({
                    type: 'warning',
                    title: 'New PE blocked',
                    message: peEditBlockedReason(demoRole) ?? '',
                  });
                  return;
                }
                navigate('/estimates/pe');
              }}
            >
              New PE
            </Button>
          </RoleGate>
          <RoleGate blocked={!canCreateOrEditDE(demoRole)} reason={deEditBlockedReason(demoRole)}>
            <Button
              variant="secondary"
              icon={<ClipboardList className="h-4 w-4" />}
              disabled={!canCreateOrEditDE(demoRole)}
              onClick={() => {
                if (!canCreateOrEditDE(demoRole)) {
                  addToast({
                    type: 'warning',
                    title: 'Open DE blocked',
                    message: deEditBlockedReason(demoRole) ?? '',
                  });
                  return;
                }
                navigate('/estimates/de');
              }}
            >
              Open DE
            </Button>
          </RoleGate>
          <Button variant="secondary" onClick={() => navigate('/boq')}>
            Open BOQ list
          </Button>
        </div>
      </div>

      {/* Stage chips */}
      <div className="mb-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setStageFilter('all')}
          className={`rounded-full px-3 py-1.5 text-sm font-medium border transition-colors ${
            stageFilter === 'all'
              ? 'bg-[#0B3A6E] text-white border-[#0B3A6E]'
              : 'bg-white text-content-secondary border-border hover:border-[#0B3A6E]/40'
          }`}
        >
          All ({stageCounts.all ?? 0})
        </button>
        {ESTIMATE_STAGES.map((stage) => (
          <button
            key={stage}
            type="button"
            onClick={() => setStageFilter(stage)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium border transition-colors ${
              stageFilter === stage
                ? 'bg-[#0B3A6E] text-white border-[#0B3A6E]'
                : 'bg-white text-content-secondary border-border hover:border-[#0B3A6E]/40'
            }`}
          >
            {ESTIMATE_STAGE_LABELS[stage]} ({stageCounts[stage] ?? 0})
          </button>
        ))}
      </div>

      <Card padding="none" className="overflow-hidden border border-[#e2e7ef] shadow-sm">
        <div className="pwd-navy-bar px-4 py-3 flex items-center gap-2">
          <Table2 className="h-4 w-4 opacity-90" />
          <span className="text-sm font-semibold tracking-wide">Works estimates</span>
        </div>

        <div className="border-b border-border bg-[#F5F7FA] px-4 py-3">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search work, project…"
              className="w-full rounded-md border border-border bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#0B3A6E] focus:ring-1 focus:ring-[#0B3A6E]/30"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<FolderOpen className="h-8 w-8" />}
              title="No estimates in this view"
              description="Create a Preliminary Estimate or clear filters."
              action={
                <RoleGate blocked={!canCreateOrEditPE(demoRole)} reason={peEditBlockedReason(demoRole)}>
                  <Button
                    variant="primary"
                    disabled={!canCreateOrEditPE(demoRole)}
                    onClick={() => {
                      if (!canCreateOrEditPE(demoRole)) {
                        addToast({
                          type: 'warning',
                          title: 'New PE blocked',
                          message: peEditBlockedReason(demoRole) ?? '',
                        });
                        return;
                      }
                      navigate('/estimates/pe');
                    }}
                  >
                    New PE
                  </Button>
                </RoleGate>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-white text-content-tertiary">
                  <th className="px-4 py-3 font-medium">Name / Work</th>
                  <th className="px-4 py-3 font-medium">Project</th>
                  <th className="px-4 py-3 font-medium">Stage</th>
                  <th className="px-4 py-3 font-medium text-right">Amount (₹)</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const nxt = nextStage(row.stage);
                  const role = advanceRoleHint(row.stage);
                  const hasSOQ = !!(row.deDraft && row.deDraft.lines.length > 0);
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-border/70 last:border-0 hover:bg-[#F5F7FA]/80"
                    >
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-content-primary">{row.name}</div>
                        <div className="mt-0.5 text-xs text-content-tertiary line-clamp-1">
                          {row.workDescription}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-content-secondary">{row.projectName}</td>
                      <td className="px-4 py-3.5">
                        <Badge variant={stageBadgeVariant(row.stage)} size="sm" dot>
                          {ESTIMATE_STAGE_LABELS[row.stage]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums font-medium text-content-primary">
                        {formatInr(row.amountInr)}
                      </td>
                      <td className="px-4 py-3.5 text-content-secondary">
                        <DateDisplay value={row.updatedAt} />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button variant="secondary" size="sm" onClick={() => openEstimate(row)}>
                            Open
                          </Button>
                          {(row.stage === 'rough' ||
                            row.stage === 'pe' ||
                            row.peDraft) && (
                            <Button variant="secondary" size="sm" onClick={() => openPE(row)}>
                              Open PE
                            </Button>
                          )}
                          {(row.stage === 'aa_es' ||
                            row.stage === 'de' ||
                            row.stage === 'ts' ||
                            row.stage === 'nit' ||
                            row.deDraft ||
                            row.stage === 'pe') && (
                            <Button variant="primary" size="sm" onClick={() => openDE(row)}>
                              Open DE
                            </Button>
                          )}
                          {nxt && (() => {
                            const canAdv = canAdvanceFromStage(demoRole, row.stage);
                            const blockReason = advanceBlockedReason(demoRole, row.stage);
                            return (
                              <RoleGate blocked={!canAdv} reason={blockReason}>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  icon={<ChevronRight className="h-3.5 w-3.5" />}
                                  iconPosition="right"
                                  disabled={!canAdv}
                                  onClick={() => {
                                    if (!canAdv) {
                                      addToast({
                                        type: 'warning',
                                        title: 'Advance blocked (demo role)',
                                        message: blockReason ?? '',
                                      });
                                      return;
                                    }
                                    setAdvanceTarget(row);
                                  }}
                                  title={
                                    canAdv
                                      ? `${role}: advance to ${ESTIMATE_STAGE_LABELS[nxt]}`
                                      : (blockReason ?? undefined)
                                  }
                                >
                                  {role} → {ESTIMATE_STAGE_LABELS[nxt]}
                                </Button>
                              </RoleGate>
                            );
                          })()}
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<Scale className="h-3.5 w-3.5" />}
                            onClick={() => openSanction(row)}
                            title="Sanction / AA-ES / T-S notes"
                          >
                            Sanction
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<Printer className="h-3.5 w-3.5" />}
                            onClick={() => exportAbstract(row, 'print')}
                            title="Print Abstract of Cost"
                          >
                            Abstract
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<Download className="h-3.5 w-3.5" />}
                            onClick={() => exportAbstract(row, 'csv')}
                            title="Download Abstract CSV"
                          >
                            Abs CSV
                          </Button>
                          {hasSOQ && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                icon={<Printer className="h-3.5 w-3.5" />}
                                onClick={() => exportSOQ(row, 'print')}
                                title="Print SOQ"
                              >
                                SOQ
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                icon={<Download className="h-3.5 w-3.5" />}
                                onClick={() => exportSOQ(row, 'csv')}
                                title="Download SOQ CSV"
                              >
                                SOQ CSV
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="mt-4 text-xs text-content-tertiary">
        Register persists in local storage (survives refresh). When a row is linked to a
        BOQ (`boqId`), PE/DE/stage/sanction saves also sync into BOQ metadata
        (`pwd_delhi_estimate`) and hydrate back on load. Use the demo wing switcher:
        Planning advances Rough→PE→AA/ES and edits PE / AA-ES notes; Engineer opens DE,
        picks DSR, advances DE→T/S→NIT, and writes T/S notes. Not GNCTD prod RBAC.
        Export Abstract / SOQ via print (Save as PDF) or CSV. Demo DSR rates are
        placeholders — not sanctioned.
      </p>

      <ConfirmDialog
        open={!!advanceTarget}
        onCancel={() => setAdvanceTarget(null)}
        onConfirm={confirmAdvance}
        variant="warning"
        title="Advance estimate stage?"
        message={
          advanceTarget
            ? `${advanceTarget.name} — ${ESTIMATE_STAGE_LABELS[advanceTarget.stage]} → ${
                nextStage(advanceTarget.stage)
                  ? ESTIMATE_STAGE_LABELS[nextStage(advanceTarget.stage)!]
                  : '—'
              } (${advanceRoleHint(advanceTarget.stage)} wing · you are ${demoRole} — demo, not full RBAC)`
            : ''
        }
        confirmLabel="Advance stage"
        cancelLabel="Cancel"
      />

      {/* Sanction panel (minimal) */}
      {sanctionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div
            className="w-full max-w-lg rounded-lg border border-[#e2e7ef] bg-white shadow-xl"
            role="dialog"
            aria-labelledby="sanction-title"
          >
            <div className="pwd-navy-bar flex items-center justify-between rounded-t-lg px-4 py-3">
              <span id="sanction-title" className="text-sm font-semibold">
                Sanction panel · स्वीकृति
              </span>
              <button
                type="button"
                className="text-sm underline opacity-90"
                onClick={() => setSanctionTarget(null)}
              >
                Close
              </button>
            </div>
            <div className="space-y-4 px-4 py-4">
              <p className="text-xs text-content-tertiary">
                {sanctionTarget.name} · Stage:{' '}
                {ESTIMATE_STAGE_LABELS[sanctionTarget.stage]} — lightweight notes
                only (AA/ES status + T/S power).
              </p>
              <label className="block text-sm font-medium text-content-primary">
                AA/ES note (Planning / Admin)
                <textarea
                  className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-[#0B3A6E] focus:ring-1 focus:ring-[#0B3A6E]/30 disabled:bg-[#F5F7FA] disabled:text-content-tertiary"
                  rows={2}
                  value={sanctionForm.aaEsNote}
                  disabled={!canEditAaEsNote(demoRole)}
                  title={aaEsNoteBlockedReason(demoRole) ?? undefined}
                  onChange={(e) =>
                    setSanctionForm((f) => ({ ...f, aaEsNote: e.target.value }))
                  }
                  placeholder="e.g. AA accorded vide order … / ES amount …"
                />
                {!canEditAaEsNote(demoRole) && (
                  <span className="mt-1 block text-2xs text-content-tertiary">
                    {aaEsNoteBlockedReason(demoRole)}
                  </span>
                )}
              </label>
              <label className="block text-sm font-medium text-content-primary">
                T/S note (Engineer / CE)
                <textarea
                  className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-[#0B3A6E] focus:ring-1 focus:ring-[#0B3A6E]/30 disabled:bg-[#F5F7FA] disabled:text-content-tertiary"
                  rows={2}
                  value={sanctionForm.tsNote}
                  disabled={!canEditTsSanctionNotes(demoRole)}
                  title={tsSanctionBlockedReason(demoRole) ?? undefined}
                  onChange={(e) =>
                    setSanctionForm((f) => ({ ...f, tsNote: e.target.value }))
                  }
                  placeholder="e.g. T/S recommended / pending CE"
                />
                {!canEditTsSanctionNotes(demoRole) && (
                  <span className="mt-1 block text-2xs text-content-tertiary">
                    {tsSanctionBlockedReason(demoRole)}
                  </span>
                )}
              </label>
              <label className="block text-sm font-medium text-content-primary">
                Sanctioning power / authority
                <input
                  className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-[#0B3A6E] focus:ring-1 focus:ring-[#0B3A6E]/30 disabled:bg-[#F5F7FA] disabled:text-content-tertiary"
                  value={sanctionForm.powerNote}
                  disabled={!canEditTsSanctionNotes(demoRole)}
                  title={tsSanctionBlockedReason(demoRole) ?? undefined}
                  onChange={(e) =>
                    setSanctionForm((f) => ({ ...f, powerNote: e.target.value }))
                  }
                  placeholder="e.g. EE / SE / CE as per DoP"
                />
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="secondary" onClick={() => setSanctionTarget(null)}>
                  Cancel
                </Button>
                <RoleGate
                  blocked={!canEditAaEsNote(demoRole) && !canEditTsSanctionNotes(demoRole)}
                  reason="No editable sanction fields for this demo role."
                >
                  <Button
                    variant="primary"
                    disabled={!canEditAaEsNote(demoRole) && !canEditTsSanctionNotes(demoRole)}
                    onClick={saveSanction}
                  >
                    Save notes
                  </Button>
                </RoleGate>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
