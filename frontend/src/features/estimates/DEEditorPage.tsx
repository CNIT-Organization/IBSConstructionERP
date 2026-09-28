/**
 * PWD Delhi — Detailed Estimate (DE) editor
 * Engineer wing: pick DSR catalog items, enter qty, Abstract of Cost rollup,
 * optional NS rate-analysis drawer.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  FilePlus2,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Badge, Breadcrumb, Button, Card } from '@/shared/ui';
import { useToastStore } from '@/stores/useToastStore';
import type { DEEditorState, DELine, DSRItem, NSRateAnalysis } from './types';
import { ESTIMATE_STAGE_LABELS } from './types';
import { computeDEAbstract, lineAmount, nsRateFromAnalysis } from './deCompute';
import { formatInr } from './peCompute';
import { searchDSR } from './demoDSR';
import {
  clearImportedDsrCatalog,
  DSR_CATALOG_CHANGE_EVENT,
  formatDsrCatalogBanner,
  getActiveDsrCatalog,
  getDsrCatalogMeta,
  importDsrCatalogFile,
  isUsingSampleDsrSeed,
  type DsrCatalogMeta,
} from './dsrCatalogStore';
import {
  createEmptyDE,
  getEstimateById,
  loadRegister,
  saveDEDraft,
} from './estimateStore';
import {
  buildDEAbstractPayload,
  downloadAbstractCsv,
  downloadSOQCsv,
  printAbstractOfCost,
  printSOQ,
} from './estimateExport';
import { queueSyncEstimateToBoq, syncEstimateToBoq } from './estimateApiSync';
import {
  canCreateOrEditDE,
  canImportDsrCatalog,
  deEditBlockedReason,
  dsrImportBlockedReason,
} from './demoRoles';
import { DemoRoleSwitcher, RoleGate, useDemoWingRole } from './DemoRoleSwitcher';

const inputClass =
  'w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-[#0B3A6E] focus:ring-1 focus:ring-[#0B3A6E]/30';

function uidLine(): string {
  return `dl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadInitial(estimateId: string | undefined): DEEditorState {
  if (estimateId) {
    const existing = getEstimateById(estimateId);
    if (existing?.deDraft) return { ...existing.deDraft, lines: [...existing.deDraft.lines] };
    if (existing) {
      return createEmptyDE({
        id: existing.id,
        workName: existing.name,
        projectName: existing.projectName,
        contingencyPct: existing.peDraft?.contingencyPct ?? 3,
        lines: [],
        stage: 'de',
      });
    }
  }
  return createEmptyDE();
}

export function DEEditorPage() {
  const { estimateId } = useParams<{ estimateId?: string }>();
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);
  const [demoRole] = useDemoWingRole();
  const canEdit = canCreateOrEditDE(demoRole);
  const deBlock = deEditBlockedReason(demoRole);

  // /estimates/de without id → picker from register (aa_es / de rows) or new
  const isPicker = !estimateId;

  const [state, setState] = useState<DEEditorState>(() =>
    isPicker ? createEmptyDE() : loadInitial(estimateId),
  );
  const [pickerSearch, setPickerSearch] = useState('');
  const [dsrSearch, setDsrSearch] = useState('');
  const [dsrCategory, setDsrCategory] = useState<DSRItem['category'] | 'all'>('all');
  const [nsLineId, setNsLineId] = useState<string | null>(null);
  const [showPickerCatalog, setShowPickerCatalog] = useState(true);
  const [dsrMeta, setDsrMeta] = useState<DsrCatalogMeta>(() => getDsrCatalogMeta());
  const [dsrCatalog, setDsrCatalog] = useState<readonly DSRItem[]>(() => getActiveDsrCatalog());
  const [dsrImporting, setDsrImporting] = useState(false);
  const dsrFileInputRef = useRef<HTMLInputElement>(null);
  const canImportDsr = canImportDsrCatalog(demoRole);
  const dsrImportBlock = dsrImportBlockedReason(demoRole);


  useEffect(() => {
    if (!isPicker && estimateId) {
      setState(loadInitial(estimateId));
    }
  }, [estimateId, isPicker]);

  useEffect(() => {
    const refresh = () => {
      setDsrMeta(getDsrCatalogMeta());
      setDsrCatalog(getActiveDsrCatalog());
    };
    refresh();
    window.addEventListener(DSR_CATALOG_CHANGE_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(DSR_CATALOG_CHANGE_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const abstract = useMemo(() => computeDEAbstract(state), [state]);
  const nsLine = state.lines.find((l) => l.id === nsLineId) ?? null;

  const filteredDsr = useMemo(
    () => searchDSR(dsrSearch, dsrCategory),
    [dsrSearch, dsrCategory, dsrCatalog],
  );

  const dsrBanner = useMemo(() => formatDsrCatalogBanner(dsrMeta), [dsrMeta]);

  const handleDsrFileSelected = async (file: File | null) => {
    if (!file) return;
    if (!canImportDsr) {
      addToast({
        type: 'warning',
        title: 'DSR import blocked (demo role)',
        message: dsrImportBlock ?? '',
      });
      return;
    }
    setDsrImporting(true);
    try {
      const { meta, parse } = await importDsrCatalogFile(file);
      setDsrMeta(meta);
      setDsrCatalog(getActiveDsrCatalog());
      const warn =
        parse.warnings.length > 0
          ? ` · ${parse.warnings.length} warning(s)`
          : '';
      addToast({
        type: 'success',
        title: 'DSR catalog imported',
        message: `${meta.filename} · ${meta.itemCount} items${warn}`,
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'DSR import failed',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setDsrImporting(false);
      if (dsrFileInputRef.current) dsrFileInputRef.current.value = '';
    }
  };

  const handleResetDsrSeed = () => {
    if (!canImportDsr) {
      addToast({
        type: 'warning',
        title: 'Reset blocked (demo role)',
        message: dsrImportBlock ?? '',
      });
      return;
    }
    const meta = clearImportedDsrCatalog();
    setDsrMeta(meta);
    setDsrCatalog(getActiveDsrCatalog());
    addToast({
      type: 'info',
      title: 'Sample DSR seed restored',
      message: `${meta.itemCount} sample items active`,
    });
  };


  const registerForPicker = useMemo(() => {
    if (!isPicker) return [];
    const q = pickerSearch.trim().toLowerCase();
    return loadRegister()
      .filter((r) => r.stage === 'de' || r.stage === 'aa_es' || r.stage === 'pe')
      .filter((r) => {
        if (!q) return true;
        return (
          r.name.toLowerCase().includes(q) ||
          r.projectName.toLowerCase().includes(q)
        );
      });
  }, [isPicker, pickerSearch]);

  const patch = (partial: Partial<DEEditorState>) => {
    if (!canEdit) return;
    setState((prev) => ({ ...prev, ...partial }));
  };

  const updateLine = (id: string, partial: Partial<DELine>) => {
    if (!canEdit) return;
    setState((prev) => ({
      ...prev,
      lines: prev.lines.map((l) => (l.id === id ? { ...l, ...partial } : l)),
    }));
  };

  const addDsrItem = (item: DSRItem) => {
    if (!canEdit) {
      addToast({
        type: 'warning',
        title: 'DSR pick blocked (demo role)',
        message: deBlock ?? '',
      });
      return;
    }
    const line: DELine = {
      id: uidLine(),
      code: item.code,
      description: item.description,
      unit: item.unit,
      qty: 1,
      rate: item.rate,
      isNS: false,
      nsAnalysis: null,
    };
    setState((prev) => ({ ...prev, lines: [...prev.lines, line] }));
    addToast({
      type: 'success',
      title: 'Item added',
      message: `${item.code} · qty 1`,
    });
  };

  const addNSItem = () => {
    if (!canEdit) {
      addToast({
        type: 'warning',
        title: 'NS line blocked (demo role)',
        message: deBlock ?? '',
      });
      return;
    }
    const line: DELine = {
      id: uidLine(),
      code: 'NS',
      description: '',
      unit: 'nos',
      qty: 1,
      rate: 0,
      isNS: true,
      nsAnalysis: { labour: 0, material: 0, overhead: 0 },
    };
    setState((prev) => ({ ...prev, lines: [...prev.lines, line] }));
    setNsLineId(line.id);
  };

  const removeLine = (id: string) => {
    if (!canEdit) {
      addToast({
        type: 'warning',
        title: 'Remove blocked (demo role)',
        message: deBlock ?? '',
      });
      return;
    }
    setState((prev) => ({
      ...prev,
      lines: prev.lines.filter((l) => l.id !== id),
    }));
    if (nsLineId === id) setNsLineId(null);
  };

  const handleSave = (andRegister: boolean) => {
    if (!canEdit) {
      addToast({
        type: 'warning',
        title: 'DE save blocked (demo role)',
        message: deBlock ?? '',
      });
      return;
    }
    if (!state.workName.trim()) {
      addToast({
        type: 'warning',
        title: 'Work name required',
        message: 'Enter a work / estimate name before saving.',
      });
      return;
    }
    const saved = saveDEDraft(state);
    setState(saved.deDraft ?? state);
    void syncEstimateToBoq(saved);
    addToast({
      type: 'success',
      title: 'DE saved',
      message: `${saved.name} · ${formatInr(saved.amountInr)}`,
    });
    if (andRegister) {
      navigate('/estimates');
    } else if (!estimateId) {
      navigate(`/estimates/${saved.id}/de`, { replace: true });
    }
  };

  // ── Picker mode: /estimates/de ──────────────────────────────────────────
  if (isPicker) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <Breadcrumb
          items={[
            { label: 'Dashboard', to: '/' },
            { label: 'Estimates', to: '/estimates' },
            { label: 'Detailed Estimate' },
          ]}
          className="mb-4"
        />
        <DemoRoleSwitcher />
        {!canEdit && (
          <p className="mb-3 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            {deBlock}
          </p>
        )}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-[#0B3A6E]">
            Open Detailed Estimate
          </h1>
          <p className="mt-1 text-sm text-content-secondary">
            विस्तृत अनुमान · Pick a work from the register or start a new DE
          </p>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <RoleGate blocked={!canEdit} reason={deBlock}>
            <Button
              variant="primary"
              icon={<FilePlus2 className="h-4 w-4" />}
              disabled={!canEdit}
              onClick={() => {
                if (!canEdit) {
                  addToast({
                    type: 'warning',
                    title: 'New DE blocked',
                    message: deBlock ?? '',
                  });
                  return;
                }
                const draft = createEmptyDE({
                  workName: '',
                  projectName: '',
                });
                const saved = saveDEDraft(draft);
                queueSyncEstimateToBoq(saved);
                navigate(`/estimates/${saved.id}/de`);
              }}
            >
              New DE
            </Button>
          </RoleGate>
          <Button variant="secondary" onClick={() => navigate('/estimates')}>
            Back to register
          </Button>
        </div>

        <Card padding="none" className="overflow-hidden border border-[#e2e7ef] shadow-sm">
          <div className="pwd-navy-bar px-4 py-3 text-sm font-semibold">
            Works ready for DE
          </div>
          <div className="border-b border-border bg-[#F5F7FA] px-4 py-3">
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary" />
              <input
                type="search"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Search work…"
                className="w-full rounded-md border border-border bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#0B3A6E] focus:ring-1 focus:ring-[#0B3A6E]/30"
              />
            </div>
          </div>
          {registerForPicker.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-content-tertiary">
              No PE / AA-ES / DE rows found. Create a new DE instead.
            </p>
          ) : (
            <ul className="divide-y divide-border/70">
              {registerForPicker.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/estimates/${row.id}/de`)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-[#F5F7FA]/80"
                  >
                    <div>
                      <div className="font-medium text-content-primary">{row.name}</div>
                      <div className="mt-0.5 text-xs text-content-tertiary">
                        {row.projectName} · {formatInr(row.amountInr)}
                      </div>
                    </div>
                    <Badge variant="blue" size="sm" dot>
                      {ESTIMATE_STAGE_LABELS[row.stage]}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    );
  }

  // ── Editor mode ─────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <Breadcrumb
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Estimates', to: '/estimates' },
          { label: 'Detailed Estimate' },
        ]}
        className="mb-4"
      />

      <DemoRoleSwitcher />
      {!canEdit && (
        <p className="mb-3 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          {deBlock} · Abstract/SOQ export still available.
        </p>
      )}

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="blue" size="sm" dot>
              {ESTIMATE_STAGE_LABELS.de}
            </Badge>
            <span className="text-xs text-content-tertiary">
              Engineer wing · demo role: {demoRole}
            </span>
          </div>
          <input
            className="w-full border-0 border-b border-transparent bg-transparent text-2xl font-semibold tracking-tight text-[#0B3A6E] outline-none focus:border-[#0B3A6E]/40"
            value={state.workName}
            onChange={(e) => patch({ workName: e.target.value })}
            placeholder="Work / estimate name"
            readOnly={!canEdit}
            title={!canEdit ? (deBlock ?? undefined) : undefined}
          />
          <input
            className="mt-1 w-full border-0 bg-transparent text-sm text-content-secondary outline-none"
            value={state.projectName}
            onChange={(e) => patch({ projectName: e.target.value })}
            placeholder="Project / circle"
            readOnly={!canEdit}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            icon={<ArrowLeft className="h-4 w-4" />}
            onClick={() => navigate('/estimates')}
          >
            Register
          </Button>
          <Button
            variant="secondary"
            icon={<Printer className="h-4 w-4" />}
            onClick={() => {
              printAbstractOfCost(buildDEAbstractPayload(state));
              addToast({
                type: 'success',
                title: 'Abstract print window',
                message: 'Print → Save as PDF',
              });
            }}
          >
            Abstract
          </Button>
          <Button
            variant="secondary"
            icon={<Download className="h-4 w-4" />}
            disabled={state.lines.length === 0}
            onClick={() => {
              downloadSOQCsv(state);
              addToast({
                type: 'success',
                title: 'SOQ CSV',
                message: `PWD_Delhi_SOQ · ${state.lines.length} lines`,
              });
            }}
          >
            SOQ CSV
          </Button>
          <RoleGate blocked={!canEdit} reason={deBlock}>
            <Button
              variant="secondary"
              icon={<Save className="h-4 w-4" />}
              disabled={!canEdit}
              onClick={() => handleSave(false)}
            >
              Save
            </Button>
          </RoleGate>
          <RoleGate blocked={!canEdit} reason={deBlock}>
            <Button
              variant="primary"
              disabled={!canEdit}
              onClick={() => handleSave(true)}
            >
              Save &amp; return
            </Button>
          </RoleGate>
        </div>
      </div>

      <div className="mb-4 space-y-2">
        <p
          className={
            isUsingSampleDsrSeed()
              ? 'rounded-md border border-[var(--pwd-accent,#E87722)]/30 bg-[var(--pwd-accent-subtle,#fef3e8)] px-3 py-2 text-xs text-[#0B3A6E]'
              : 'rounded-md border border-emerald-300/50 bg-emerald-50 px-3 py-2 text-xs text-emerald-950'
          }
        >
          <span className="font-semibold">
            {dsrMeta.source === 'sample_seed' ? 'Sample seed' : 'Imported schedule'}
            {' · '}
          </span>
          {dsrBanner}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={dsrFileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="hidden"
            onChange={(e) => {
              void handleDsrFileSelected(e.target.files?.[0] ?? null);
            }}
          />
          <RoleGate blocked={!canImportDsr} reason={dsrImportBlock}>
            <Button
              variant="secondary"
              size="sm"
              icon={<Upload className="h-3.5 w-3.5" />}
              disabled={!canImportDsr || dsrImporting}
              onClick={() => {
                if (!canImportDsr) {
                  addToast({
                    type: 'warning',
                    title: 'DSR import blocked',
                    message: dsrImportBlock ?? '',
                  });
                  return;
                }
                dsrFileInputRef.current?.click();
              }}
            >
              {dsrImporting ? 'Importing…' : 'Import DSR (CSV / Excel)'}
            </Button>
          </RoleGate>
          {dsrMeta.source === 'imported' && (
            <RoleGate blocked={!canImportDsr} reason={dsrImportBlock}>
              <Button
                variant="ghost"
                size="sm"
                icon={<RotateCcw className="h-3.5 w-3.5" />}
                disabled={!canImportDsr}
                onClick={handleResetDsrSeed}
              >
                Restore sample seed
              </Button>
            </RoleGate>
          )}
          <span className="text-2xs text-content-tertiary">
            {dsrCatalog.length} items in picker
            {canImportDsr
              ? ' · Engineer can replace with official file'
              : ' · Planning: view rates; Engineer imports'}
          </span>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5 min-w-0">
          {/* DSR picker */}
          <Card padding="none" className="overflow-hidden border border-[#e2e7ef] shadow-sm">
            <div className="pwd-navy-bar flex items-center justify-between px-4 py-3">
              <span className="text-sm font-semibold">DSR item picker</span>
              <button
                type="button"
                className="text-xs underline opacity-90"
                onClick={() => setShowPickerCatalog((v) => !v)}
              >
                {showPickerCatalog ? 'Hide' : 'Show'}
              </button>
            </div>
            {showPickerCatalog && (
              <>
                <div className="flex flex-wrap gap-2 border-b border-border bg-[#F5F7FA] px-4 py-3">
                  <div className="relative min-w-[200px] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary" />
                    <input
                      type="search"
                      value={dsrSearch}
                      onChange={(e) => setDsrSearch(e.target.value)}
                      placeholder="Search code or description…"
                      className="w-full rounded-md border border-border bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#0B3A6E] focus:ring-1 focus:ring-[#0B3A6E]/30"
                    />
                  </div>
                  <select
                    className={inputClass + ' w-auto'}
                    value={dsrCategory}
                    onChange={(e) =>
                      setDsrCategory(e.target.value as DSRItem['category'] | 'all')
                    }
                  >
                    <option value="all">All categories</option>
                    <option value="earthwork">Earthwork</option>
                    <option value="concrete">Concrete</option>
                    <option value="masonry">Masonry</option>
                    <option value="steel">Steel</option>
                    <option value="finishing">Finishing</option>
                    <option value="road">Road</option>
                    <option value="misc">Misc</option>
                  </select>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Plus className="h-3.5 w-3.5" />}
                    onClick={addNSItem}
                  >
                    Add NS
                  </Button>
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {filteredDsr.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-content-tertiary">
                      No DSR items match ({dsrCatalog.length} in catalog).
                    </p>
                  ) : (
                    <ul className="divide-y divide-border/60">
                      {filteredDsr.map((item) => (
                        <li
                          key={item.code}
                          className="flex items-start gap-3 px-4 py-2.5 hover:bg-[#F5F7FA]/80"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-2">
                              <span className="font-mono text-xs font-semibold text-[#0B3A6E]">
                                {item.code}
                              </span>
                              <span className="text-xs text-content-tertiary">
                                {item.unit} · {formatInr(item.rate)}
                              </span>
                            </div>
                            <p className="mt-0.5 line-clamp-2 text-xs text-content-secondary">
                              {item.description}
                            </p>
                          </div>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => addDsrItem(item)}
                          >
                            Add
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </Card>

          {/* Line table */}
          <Card padding="none" className="overflow-hidden border border-[#e2e7ef] shadow-sm">
            <div className="pwd-navy-bar px-4 py-3 text-sm font-semibold">
              Estimate lines ({state.lines.length})
            </div>
            {state.lines.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-content-tertiary">
                Add DSR items above, or create an NS (non-schedule) line.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-[#F5F7FA] text-content-tertiary">
                      <th className="px-3 py-2.5 font-medium">Code</th>
                      <th className="px-3 py-2.5 font-medium">Description</th>
                      <th className="px-3 py-2.5 font-medium">Unit</th>
                      <th className="px-3 py-2.5 font-medium text-right">Qty</th>
                      <th className="px-3 py-2.5 font-medium text-right">Rate (₹)</th>
                      <th className="px-3 py-2.5 font-medium text-right">Amount</th>
                      <th className="px-3 py-2.5 font-medium text-right"> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.lines.map((line) => (
                      <tr
                        key={line.id}
                        className="border-b border-border/70 last:border-0 align-top"
                      >
                        <td className="px-3 py-2.5">
                          {line.isNS ? (
                            <button
                              type="button"
                              className="font-mono text-xs font-semibold text-[var(--pwd-accent,#E87722)] underline"
                              onClick={() => setNsLineId(line.id)}
                              title="Open NS rate analysis"
                            >
                              NS
                            </button>
                          ) : (
                            <span className="font-mono text-xs font-semibold text-[#0B3A6E]">
                              {line.code}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 max-w-[280px]">
                          {line.isNS ? (
                            <input
                              className={inputClass}
                              value={line.description}
                              onChange={(e) =>
                                updateLine(line.id, { description: e.target.value })
                              }
                              placeholder="NS item description"
                            />
                          ) : (
                            <span className="line-clamp-2 text-xs text-content-secondary">
                              {line.description}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-content-secondary">
                          {line.isNS ? (
                            <input
                              className={inputClass + ' w-20'}
                              value={line.unit}
                              onChange={(e) =>
                                updateLine(line.id, { unit: e.target.value })
                              }
                            />
                          ) : (
                            line.unit
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            className={inputClass + ' w-24 text-right tabular-nums'}
                            value={line.qty || ''}
                            onChange={(e) =>
                              updateLine(line.id, {
                                qty: Number(e.target.value) || 0,
                              })
                            }
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {line.isNS ? (
                            <button
                              type="button"
                              className="tabular-nums text-[#0B3A6E] underline"
                              onClick={() => setNsLineId(line.id)}
                            >
                              {formatInr(line.rate)}
                            </button>
                          ) : (
                            <span className="tabular-nums">{formatInr(line.rate)}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                          {formatInr(lineAmount(line))}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            className="rounded p-1.5 text-content-tertiary hover:bg-red-50 hover:text-red-600"
                            onClick={() => removeLine(line.id)}
                            aria-label="Remove line"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* Abstract of Cost sidebar */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Card padding="none" className="overflow-hidden border border-[#e2e7ef] shadow-sm">
            <div className="pwd-navy-bar px-4 py-2.5 text-sm font-semibold">
              Abstract of Cost · लागत सार
            </div>
            <div className="space-y-3 px-4 py-4">
              <label className="block text-xs font-medium text-content-secondary">
                Contingency %
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  className={inputClass + ' mt-1'}
                  value={state.contingencyPct}
                  onChange={(e) =>
                    patch({ contingencyPct: Number(e.target.value) || 0 })
                  }
                />
              </label>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-t border-border/70">
                    <td className="py-2 text-content-secondary">Works total · कार्य योग</td>
                    <td className="py-2 text-right tabular-nums font-medium">
                      {formatInr(abstract.worksTotal)}
                    </td>
                  </tr>
                  <tr className="border-t border-border/70">
                    <td className="py-2 text-content-secondary">
                      Contingency ({abstract.contingencyPct}%) · आकस्मिक
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatInr(abstract.contingencyAmount)}
                    </td>
                  </tr>
                  <tr className="border-t border-border/70 bg-[#e8eef5]">
                    <td className="py-2.5 font-semibold text-[#0B3A6E]">
                      Grand total (DE) · कुल लागत
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-base font-bold text-[#0B3A6E]">
                      {formatInr(abstract.estimatedCost)}
                    </td>
                  </tr>
                  <tr className="border-t border-border/70">
                    <td className="py-2 text-xs text-content-tertiary">
                      GST {abstract.gstPct}% (info) · जीएसटी
                    </td>
                    <td className="py-2 text-right text-xs tabular-nums text-content-tertiary">
                      {formatInr(abstract.gstAmount)}
                    </td>
                  </tr>
                  <tr>
                    <td className="pb-1 text-xs text-content-tertiary">
                      With GST (info only)
                    </td>
                    <td className="pb-1 text-right text-xs tabular-nums text-content-tertiary">
                      {formatInr(abstract.totalWithGstInfo)}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="text-2xs text-content-tertiary leading-relaxed">
                GST is informational for works contracts and is not added into
                the DE amount shown on the register. Rates follow the active DSR
                catalog ({dsrMeta.source === 'sample_seed' ? 'sample seed' : dsrMeta.filename ?? 'imported'}) — not for tender award without official schedule.
              </p>
              <div className="flex flex-col gap-2 pt-1">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Printer className="h-3.5 w-3.5" />}
                  onClick={() => {
                    printAbstractOfCost(buildDEAbstractPayload(state));
                    addToast({
                      type: 'success',
                      title: 'Abstract print window',
                      message: 'Print → Save as PDF (PWD_Delhi_Abstract_…)',
                    });
                  }}
                >
                  Export Abstract
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Download className="h-3.5 w-3.5" />}
                  onClick={() => {
                    downloadAbstractCsv(buildDEAbstractPayload(state));
                    addToast({
                      type: 'success',
                      title: 'Abstract CSV',
                      message: 'Downloaded PWD_Delhi_Abstract_….csv',
                    });
                  }}
                >
                  Abstract CSV
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Printer className="h-3.5 w-3.5" />}
                  disabled={state.lines.length === 0}
                  onClick={() => {
                    printSOQ(state);
                    addToast({
                      type: 'success',
                      title: 'SOQ print window',
                      message: `${state.lines.length} lines · Print → Save as PDF`,
                    });
                  }}
                >
                  Export SOQ
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Download className="h-3.5 w-3.5" />}
                  disabled={state.lines.length === 0}
                  onClick={() => {
                    downloadSOQCsv(state);
                    addToast({
                      type: 'success',
                      title: 'SOQ CSV',
                      message: `PWD_Delhi_SOQ_….csv · ${state.lines.length} lines`,
                    });
                  }}
                >
                  SOQ CSV
                </Button>
              </div>
            </div>
          </Card>
        </aside>
      </div>

      {/* NS rate analysis drawer */}
      {nsLine && (
        <NSDrawer
          line={nsLine}
          onClose={() => setNsLineId(null)}
          onChange={(partial) => updateLine(nsLine.id, partial)}
        />
      )}
    </div>
  );
}

function NSDrawer({
  line,
  onClose,
  onChange,
}: {
  line: DELine;
  onClose: () => void;
  onChange: (partial: Partial<DELine>) => void;
}) {
  const ns: NSRateAnalysis = line.nsAnalysis ?? {
    labour: 0,
    material: 0,
    overhead: 0,
  };
  const rate = nsRateFromAnalysis(ns);

  const patchNs = (partial: Partial<NSRateAnalysis>) => {
    const next = { ...ns, ...partial };
    onChange({
      nsAnalysis: next,
      rate: nsRateFromAnalysis(next),
      isNS: true,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="dialog">
      <button
        type="button"
        className="flex-1 cursor-default"
        aria-label="Close drawer backdrop"
        onClick={onClose}
      />
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <div className="pwd-navy-bar flex items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold">NS rate analysis</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 hover:bg-white/10"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <p className="text-xs text-content-tertiary">
            Non-schedule item — stub analysis (labour + material + overhead →
            rate). Replace with full Analysis of Rates later.
          </p>
          <label className="block text-xs font-medium text-content-secondary">
            Description
            <input
              className={inputClass + ' mt-1'}
              value={line.description}
              onChange={(e) => onChange({ description: e.target.value })}
            />
          </label>
          <label className="block text-xs font-medium text-content-secondary">
            Unit
            <input
              className={inputClass + ' mt-1'}
              value={line.unit}
              onChange={(e) => onChange({ unit: e.target.value })}
            />
          </label>
          <div className="grid grid-cols-1 gap-3">
            {(
              [
                ['labour', 'Labour (₹)'],
                ['material', 'Material (₹)'],
                ['overhead', 'Overhead / profit (₹)'],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="block text-xs font-medium text-content-secondary"
              >
                {label}
                <input
                  type="number"
                  min={0}
                  step="any"
                  className={inputClass + ' mt-1 tabular-nums'}
                  value={ns[key] || ''}
                  onChange={(e) =>
                    patchNs({ [key]: Number(e.target.value) || 0 })
                  }
                />
              </label>
            ))}
          </div>
          <div className="rounded-lg border border-[#e2e7ef] bg-[#F5F7FA] px-4 py-3">
            <div className="text-xs text-content-tertiary">Derived rate</div>
            <div className="mt-0.5 text-lg font-bold tabular-nums text-[#0B3A6E]">
              {formatInr(rate)}
            </div>
          </div>
        </div>
        <div className="border-t border-border px-4 py-3">
          <Button variant="primary" className="w-full" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
