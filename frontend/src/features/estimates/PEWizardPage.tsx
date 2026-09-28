/**
 * PWD Delhi — Preliminary Estimate (PE) wizard
 * Steps: Work basics → PAR → Cost Index → Contingency → Abstract of Cost
 * Max ~3 primary actions per step; navy + saffron step progress.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Download, Printer, Save } from 'lucide-react';
import { Breadcrumb, Button, Card, CardContent, CardHeader } from '@/shared/ui';
import { useToastStore } from '@/stores/useToastStore';
import type { PEWizardState } from './types';
import {
  DEMO_COST_INDEX_OPTIONS,
  DEMO_PAR_OPTIONS,
  computeAbstract,
  formatInr,
} from './peCompute';
import {
  createEmptyPEWizard,
  getEstimateById,
  savePEDraft,
} from './estimateStore';
import {
  buildPEAbstractPayload,
  downloadAbstractCsv,
  printAbstractOfCost,
} from './estimateExport';
import { syncEstimateToBoq } from './estimateApiSync';
import { canCreateOrEditPE, peEditBlockedReason } from './demoRoles';
import { DemoRoleSwitcher, RoleGate, useDemoWingRole } from './DemoRoleSwitcher';

const STEPS = [
  { id: 1, title: 'Work basics', subtitle: 'कार्य विवरण · Plinth area' },
  { id: 2, title: 'PAR selection', subtitle: 'प्लिंथ क्षेत्र दर · Rate' },
  { id: 3, title: 'Cost Index', subtitle: 'लागत सूचकांक' },
  { id: 4, title: 'Contingency', subtitle: 'आकस्मिक व्यय %' },
  { id: 5, title: 'Abstract of Cost', subtitle: 'लागत सार' },
] as const;

function loadInitial(estimateId: string | undefined): PEWizardState {
  if (estimateId) {
    const existing = getEstimateById(estimateId);
    if (existing?.peDraft) return { ...existing.peDraft };
    if (existing) {
      return createEmptyPEWizard({
        id: existing.id,
        workName: existing.name,
        projectName: existing.projectName,
        stage: existing.stage === 'rough' ? 'pe' : existing.stage,
      });
    }
  }
  return createEmptyPEWizard();
}

export function PEWizardPage() {
  const { estimateId } = useParams<{ estimateId?: string }>();
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);
  const [demoRole] = useDemoWingRole();
  const canEdit = canCreateOrEditPE(demoRole);
  const peBlock = peEditBlockedReason(demoRole);
  const [step, setStep] = useState(1);
  const [state, setState] = useState<PEWizardState>(() => loadInitial(estimateId));

  const abstract = useMemo(() => computeAbstract(state), [state]);

  const patch = (partial: Partial<PEWizardState>) => {
    if (!canEdit) return;
    setState((prev) => ({ ...prev, ...partial }));
  };

  const canNext = (): boolean => {
    if (step === 1) {
      return state.workName.trim().length > 0 && state.plinthAreaSqm > 0;
    }
    if (step === 2) {
      return state.parRate > 0 && state.parCode.length > 0;
    }
    if (step === 3) {
      return state.costIndexFactor > 0;
    }
    if (step === 4) {
      return state.contingencyPct >= 0;
    }
    return true;
  };

  const goNext = () => {
    if (!canNext()) {
      addToast({
        type: 'warning',
        title: 'Complete required fields',
        message: 'Fill the highlighted fields before continuing.',
      });
      return;
    }
    setStep((s) => Math.min(5, s + 1));
  };

  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const handleSave = (andRegister: boolean) => {
    if (!canEdit) {
      addToast({
        type: 'warning',
        title: 'PE save blocked (demo role)',
        message: peBlock ?? '',
      });
      return;
    }
    if (!state.workName.trim()) {
      addToast({
        type: 'warning',
        title: 'Work name required',
        message: 'Enter a work / estimate name on step 1.',
      });
      setStep(1);
      return;
    }
    const saved = savePEDraft(state);
    setState(saved.peDraft ?? state);
    void syncEstimateToBoq(saved);
    addToast({
      type: 'success',
      title: 'PE saved',
      message: `${saved.name} · ${formatInr(saved.amountInr)}`,
    });
    if (andRegister) {
      navigate('/estimates/register');
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <Breadcrumb
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Estimates', to: '/estimates' },
          { label: 'Preliminary Estimate' },
        ]}
        className="mb-4"
      />

      <DemoRoleSwitcher />

      {!canEdit && (
        <p className="mb-3 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          {peBlock}
        </p>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-[#0B3A6E]">
          Preliminary Estimate
        </h1>
        <p className="mt-1 text-sm text-content-secondary">
          प्रारंभिक अनुमान · Plinth area → PAR → CI → Contingency → Abstract
        </p>
      </div>

      {/* Step progress — saffron accent for current */}
      <ol className="mb-6 flex flex-wrap gap-2">
        {STEPS.map((s) => {
          const active = s.id === step;
          const done = s.id < step;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setStep(s.id)}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? 'border-[var(--pwd-accent,#E87722)] bg-[var(--pwd-accent-subtle,#fef3e8)] text-[#0B3A6E] font-semibold'
                    : done
                      ? 'border-[#0B3A6E]/30 bg-[#e8eef5] text-[#0B3A6E]'
                      : 'border-border bg-white text-content-tertiary'
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-2xs font-bold ${
                    active
                      ? 'bg-[var(--pwd-accent,#E87722)] text-white'
                      : done
                        ? 'bg-[#0B3A6E] text-white'
                        : 'bg-surface-secondary text-content-tertiary'
                  }`}
                >
                  {done ? <Check className="h-3 w-3" /> : s.id}
                </span>
                <span className="hidden sm:inline">{s.title}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <Card className="border border-[#e2e7ef] shadow-sm">
        <CardHeader
          title={STEPS[step - 1]!.title}
          subtitle={STEPS[step - 1]!.subtitle}
        />
        <CardContent className="space-y-5">
          {step === 1 && (
            <>
              <Field label="Work / estimate name" required>
                <input
                  className={inputClass}
                  value={state.workName}
                  onChange={(e) => patch({ workName: e.target.value })}
                  placeholder="e.g. Construction of Govt. School, Rohini"
                />
              </Field>
              <Field label="Project / circle">
                <input
                  className={inputClass}
                  value={state.projectName}
                  onChange={(e) => patch({ projectName: e.target.value })}
                  placeholder="e.g. Education — Rohini"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Work type">
                  <select
                    className={inputClass}
                    value={state.workType}
                    onChange={(e) =>
                      patch({
                        workType: e.target.value as PEWizardState['workType'],
                      })
                    }
                  >
                    <option value="building">Building</option>
                    <option value="road">Road</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
                <Field label="Plinth area (m²)" required>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className={inputClass}
                    value={state.plinthAreaSqm || ''}
                    onChange={(e) =>
                      patch({ plinthAreaSqm: Number(e.target.value) || 0 })
                    }
                    placeholder="4250"
                  />
                </Field>
              </div>
              <Field label="Location note">
                <input
                  className={inputClass}
                  value={state.locationNote}
                  onChange={(e) => patch({ locationNote: e.target.value })}
                />
              </Field>
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-sm text-content-secondary">
                Select a Plinth Area Rate (PAR). Demo rates use CWICR-style
                placeholders; PWD Delhi DSR pack can replace these later.
              </p>
              <div className="space-y-2">
                {DEMO_PAR_OPTIONS.map((opt) => {
                  const selected = state.parCode === opt.code;
                  return (
                    <button
                      key={opt.code}
                      type="button"
                      onClick={() =>
                        patch({
                          parCode: opt.code,
                          parDescription: opt.description,
                          parRate: opt.rate,
                        })
                      }
                      className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                        selected
                          ? 'border-[#0B3A6E] bg-[#e8eef5]'
                          : 'border-border bg-white hover:border-[#0B3A6E]/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-content-primary">
                            {opt.description}
                          </div>
                          <div className="mt-0.5 text-xs text-content-tertiary">
                            {opt.code}
                          </div>
                        </div>
                        <div className="shrink-0 tabular-nums font-semibold text-[#0B3A6E]">
                          {formatInr(opt.rate)}/m²
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <Field label="Or enter custom PAR rate (₹ / m²)">
                <input
                  type="number"
                  min={0}
                  className={inputClass}
                  value={state.parRate || ''}
                  onChange={(e) => {
                    const rate = Number(e.target.value) || 0;
                    patch({
                      parRate: rate,
                      parCode: state.parCode || 'PAR-CUSTOM',
                      parDescription: state.parDescription || 'Custom PAR',
                    });
                  }}
                />
              </Field>
            </>
          )}

          {step === 3 && (
            <>
              <p className="text-sm text-content-secondary">
                Apply the current Cost Index factor for PWD Delhi.
              </p>
              <div className="space-y-2">
                {DEMO_COST_INDEX_OPTIONS.map((opt) => {
                  const selected = state.costIndexFactor === opt.factor;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() =>
                        patch({
                          costIndexFactor: opt.factor,
                          costIndexLabel: opt.label,
                        })
                      }
                      className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                        selected
                          ? 'border-[#0B3A6E] bg-[#e8eef5]'
                          : 'border-border bg-white hover:border-[#0B3A6E]/40'
                      }`}
                    >
                      <div className="flex justify-between gap-3">
                        <span className="font-medium">{opt.label}</span>
                        <span className="tabular-nums text-[#0B3A6E] font-semibold">
                          × {opt.factor.toFixed(2)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <Field label="Custom factor">
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className={inputClass}
                  value={state.costIndexFactor || ''}
                  onChange={(e) =>
                    patch({
                      costIndexFactor: Number(e.target.value) || 0,
                      costIndexLabel: 'Custom CI',
                    })
                  }
                />
              </Field>
            </>
          )}

          {step === 4 && (
            <>
              <p className="text-sm text-content-secondary">
                Contingency on indexed cost (typical PE: 3%). Keep actions few —
                adjust % then continue to Abstract.
              </p>
              <Field label="Contingency %">
                <input
                  type="number"
                  min={0}
                  max={25}
                  step={0.5}
                  className={inputClass}
                  value={state.contingencyPct}
                  onChange={(e) =>
                    patch({ contingencyPct: Number(e.target.value) || 0 })
                  }
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                {[2, 3, 5].map((pct) => (
                  <Button
                    key={pct}
                    type="button"
                    variant={state.contingencyPct === pct ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => patch({ contingencyPct: pct })}
                  >
                    {pct}%
                  </Button>
                ))}
              </div>
            </>
          )}

          {step === 5 && (
            <AbstractSummary state={state} abstract={abstract} />
          )}
        </CardContent>
      </Card>

      {/* Footer actions — max ~3 primary */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="ghost"
          icon={<ArrowLeft className="h-4 w-4" />}
          onClick={() => (step === 1 ? navigate('/estimates') : goBack())}
        >
          {step === 1 ? 'Register' : 'Back'}
        </Button>

        <div className="flex flex-wrap gap-2">
          {step < 5 ? (
            <>
              <RoleGate blocked={!canEdit} reason={peBlock}>
                <Button
                  variant="secondary"
                  icon={<Save className="h-4 w-4" />}
                  disabled={!canEdit}
                  onClick={() => handleSave(false)}
                >
                  Save draft
                </Button>
              </RoleGate>
              <Button
                variant="primary"
                icon={<ArrowRight className="h-4 w-4" />}
                iconPosition="right"
                onClick={goNext}
                disabled={!canNext()}
              >
                Continue
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                icon={<Printer className="h-4 w-4" />}
                onClick={() => {
                  printAbstractOfCost(buildPEAbstractPayload(state));
                  addToast({
                    type: 'success',
                    title: 'Abstract print window',
                    message: 'Use Print → Save as PDF (PWD_Delhi_Abstract_…)',
                  });
                }}
              >
                Export Abstract
              </Button>
              <Button
                variant="secondary"
                icon={<Download className="h-4 w-4" />}
                onClick={() => {
                  downloadAbstractCsv(buildPEAbstractPayload(state));
                  addToast({
                    type: 'success',
                    title: 'Abstract CSV',
                    message: 'Downloaded PWD_Delhi_Abstract_….csv',
                  });
                }}
              >
                Abstract CSV
              </Button>
              <RoleGate blocked={!canEdit} reason={peBlock}>
                <Button
                  variant="secondary"
                  icon={<Save className="h-4 w-4" />}
                  disabled={!canEdit}
                  onClick={() => handleSave(false)}
                >
                  Save PE
                </Button>
              </RoleGate>
              <RoleGate blocked={!canEdit} reason={peBlock}>
                <Button
                  variant="primary"
                  disabled={!canEdit}
                  onClick={() => handleSave(true)}
                >
                  Save & open register
                </Button>
              </RoleGate>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const inputClass =
  'w-full rounded-md border border-border bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0B3A6E] focus:ring-1 focus:ring-[#0B3A6E]/30';

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-content-primary">
        {label}
        {required ? <span className="text-semantic-error"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function AbstractSummary({
  state,
  abstract,
}: {
  state: PEWizardState;
  abstract: ReturnType<typeof computeAbstract>;
}) {
  const rows: Array<{ label: string; value: string; emphasize?: boolean; muted?: boolean }> = [
    {
      label: 'Plinth area',
      value: `${abstract.plinthAreaSqm.toLocaleString('en-IN')} m²`,
    },
    {
      label: `PAR (${state.parCode || '—'})`,
      value: `${formatInr(abstract.parRate)} / m²`,
    },
    {
      label: 'Base cost (area × PAR)',
      value: formatInr(abstract.baseCost),
    },
    {
      label: `Cost Index × ${abstract.costIndexFactor.toFixed(2)} · लागत सूचकांक`,
      value: formatInr(abstract.indexedCost),
    },
    {
      label: `Contingency (${abstract.contingencyPct}%) · आकस्मिक व्यय`,
      value: formatInr(abstract.contingencyAmount),
    },
    {
      label: 'Estimated cost (PE) · अनुमानित लागत',
      value: formatInr(abstract.estimatedCost),
      emphasize: true,
    },
    {
      label: `GST ${abstract.gstPct}% (info — works) · जीएसटी`,
      value: formatInr(abstract.gstAmount),
      muted: true,
    },
    {
      label: 'Total with GST (info only) · जीएसटी सहित',
      value: formatInr(abstract.totalWithGstInfo),
      muted: true,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[#e2e7ef] bg-[#F5F7FA] px-4 py-3">
        <div className="text-sm font-semibold text-[#0B3A6E]">{state.workName || 'Untitled work'}</div>
        <div className="mt-0.5 text-xs text-content-tertiary">
          {state.projectName || '—'} · {state.workType} · {state.locationNote}
        </div>
        <div className="mt-1 text-xs text-content-secondary">{state.parDescription}</div>
      </div>

      <div className="overflow-hidden rounded-lg border border-[#e2e7ef]">
        <div className="pwd-navy-bar px-4 py-2 text-sm font-semibold">Abstract of Cost · लागत सार</div>
        <table className="w-full text-sm">
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.label}
                className={`border-t border-border/70 ${
                  row.emphasize ? 'bg-[#e8eef5]' : 'bg-white'
                }`}
              >
                <td
                  className={`px-4 py-2.5 ${
                    row.muted ? 'text-content-tertiary' : 'text-content-secondary'
                  } ${row.emphasize ? 'font-semibold text-[#0B3A6E]' : ''}`}
                >
                  {row.label}
                </td>
                <td
                  className={`px-4 py-2.5 text-right tabular-nums ${
                    row.emphasize
                      ? 'font-bold text-[#0B3A6E] text-base'
                      : row.muted
                        ? 'text-content-tertiary'
                        : 'font-medium text-content-primary'
                  }`}
                >
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-content-tertiary">
        GST line is informational for works contracts and is not added into the
        PE estimated cost used on the register. Replace demo PAR/CI with sanctioned
        PWD Delhi DSR / Cost Index when the india_pack rate pack is loaded.
      </p>
    </div>
  );
}
