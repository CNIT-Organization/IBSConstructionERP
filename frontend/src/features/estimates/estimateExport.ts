/**
 * Client-side Abstract of Cost + SOQ export (print HTML / CSV).
 * No new deps — uses Blob download + window.print() styled page.
 */

import type {
  AbstractOfCost,
  DEAbstractOfCost,
  DEEditorState,
  DELine,
  EstimateRegisterItem,
  PEWizardState,
} from './types';
import { ESTIMATE_STAGE_LABELS } from './types';
import { computeAbstract, formatInr } from './peCompute';
import { computeDEAbstract, lineAmount } from './deCompute';

function slugWork(name: string): string {
  const s = (name || 'work')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return s || 'work';
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob(['\uFEFF' + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function openPrintWindow(title: string, bodyHtml: string): void {
  const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');
  if (!w) {
    // Popup blocked — fall back to downloading HTML
    downloadText(
      `${title.replace(/\s+/g, '_')}.html`,
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body>${bodyHtml}</body></html>`,
      'text/html;charset=utf-8',
    );
    return;
  }
  const doc = w.document;
  doc.open();
  doc.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: "Segoe UI", system-ui, sans-serif; color: #111; margin: 24px; font-size: 13px; }
    h1 { font-size: 18px; color: #0B3A6E; margin: 0 0 4px; }
    h2 { font-size: 14px; color: #0B3A6E; margin: 20px 0 8px; border-bottom: 2px solid #0B3A6E; padding-bottom: 4px; }
    .sub { color: #555; font-size: 12px; margin-bottom: 16px; }
    .meta { margin-bottom: 16px; }
    .meta div { margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #c5cdd8; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #0B3A6E; color: #fff; font-weight: 600; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    tr.emph td { background: #e8eef5; font-weight: 700; color: #0B3A6E; }
    tr.muted td { color: #666; font-size: 12px; }
    .footer { margin-top: 24px; font-size: 11px; color: #777; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #e8eef5; color: #0B3A6E; font-size: 11px; font-weight: 600; }
    @media print {
      body { margin: 12mm; }
      button { display: none !important; }
    }
  </style>
</head>
<body>
  <button onclick="window.print()" style="margin-bottom:12px;padding:6px 12px;cursor:pointer;">Print / Save as PDF</button>
  ${bodyHtml}
  <p class="footer">PWD Delhi · Works Estimating · Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST · Use browser Print → Save as PDF</p>
  <script>setTimeout(function(){ try { window.focus(); } catch(e) {} }, 200);</script>
</body>
</html>`);
  doc.close();
}

function csvEscape(v: string | number): string {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Build PE or DE abstract rows for print/CSV. */
export type AbstractExportKind = 'pe' | 'de';

export interface AbstractExportPayload {
  kind: AbstractExportKind;
  workName: string;
  projectName: string;
  stageLabel: string;
  extraMeta?: string;
  rows: Array<{ label: string; value: string; emphasize?: boolean; muted?: boolean }>;
  grandTotalLabel: string;
  grandTotalValue: string;
}

export function buildPEAbstractPayload(state: PEWizardState): AbstractExportPayload {
  const a: AbstractOfCost = computeAbstract(state);
  return {
    kind: 'pe',
    workName: state.workName || 'Untitled PE',
    projectName: state.projectName || '—',
    stageLabel: ESTIMATE_STAGE_LABELS[state.stage] ?? 'PE',
    extraMeta: [
      state.workType,
      state.locationNote,
      state.parDescription,
      state.costIndexLabel,
    ]
      .filter(Boolean)
      .join(' · '),
    rows: [
      { label: 'Plinth area / प्लिंथ क्षेत्र', value: `${a.plinthAreaSqm.toLocaleString('en-IN')} m²` },
      { label: `PAR (${state.parCode || '—'})`, value: `${formatInr(a.parRate)} / m²` },
      { label: 'Base cost (area × PAR) / आधार लागत', value: formatInr(a.baseCost) },
      {
        label: `Cost Index × ${a.costIndexFactor.toFixed(2)} / लागत सूचकांक`,
        value: formatInr(a.indexedCost),
      },
      {
        label: `Contingency (${a.contingencyPct}%) / आकस्मिक व्यय`,
        value: formatInr(a.contingencyAmount),
      },
      {
        label: 'Estimated cost (PE) / अनुमानित लागत',
        value: formatInr(a.estimatedCost),
        emphasize: true,
      },
      {
        label: `GST ${a.gstPct}% (informational — works contract) / जीएसटी`,
        value: formatInr(a.gstAmount),
        muted: true,
      },
      {
        label: 'Total with GST (info only)',
        value: formatInr(a.totalWithGstInfo),
        muted: true,
      },
    ],
    grandTotalLabel: 'Estimated cost (PE)',
    grandTotalValue: formatInr(a.estimatedCost),
  };
}

export function buildDEAbstractPayload(state: DEEditorState): AbstractExportPayload {
  const a: DEAbstractOfCost = computeDEAbstract(state);
  return {
    kind: 'de',
    workName: state.workName || 'Untitled DE',
    projectName: state.projectName || '—',
    stageLabel: ESTIMATE_STAGE_LABELS[state.stage] ?? 'DE',
    extraMeta: `${a.lineCount} schedule line(s)`,
    rows: [
      { label: 'Works total / कार्य योग', value: formatInr(a.worksTotal) },
      {
        label: `Contingency (${a.contingencyPct}%) / आकस्मिक व्यय`,
        value: formatInr(a.contingencyAmount),
      },
      {
        label: 'Grand total (DE) / कुल लागत',
        value: formatInr(a.estimatedCost),
        emphasize: true,
      },
      {
        label: `GST ${a.gstPct}% (informational — works contract) / जीएसटी`,
        value: formatInr(a.gstAmount),
        muted: true,
      },
      {
        label: 'Total with GST (info only)',
        value: formatInr(a.totalWithGstInfo),
        muted: true,
      },
    ],
    grandTotalLabel: 'Grand total (DE)',
    grandTotalValue: formatInr(a.estimatedCost),
  };
}

function abstractBodyHtml(payload: AbstractExportPayload): string {
  const rowsHtml = payload.rows
    .map((r) => {
      const cls = r.emphasize ? 'emph' : r.muted ? 'muted' : '';
      return `<tr class="${cls}"><td>${escapeHtml(r.label)}</td><td class="num">${escapeHtml(r.value)}</td></tr>`;
    })
    .join('');
  return `
  <h1>Abstract of Cost · लागत सार</h1>
  <p class="sub">PWD Delhi · ${payload.kind === 'pe' ? 'Preliminary Estimate' : 'Detailed Estimate'}</p>
  <div class="meta">
    <div><strong>${escapeHtml(payload.workName)}</strong></div>
    <div>${escapeHtml(payload.projectName)}</div>
    <div><span class="badge">${escapeHtml(payload.stageLabel)}</span>${
      payload.extraMeta ? ` · ${escapeHtml(payload.extraMeta)}` : ''
    }</div>
  </div>
  <h2>Abstract of Cost</h2>
  <table>
    <thead><tr><th>Particulars</th><th class="num">Amount (₹)</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>`;
}

/** Print-friendly Abstract (Save as PDF via browser). Filename hint: PWD_Delhi_Abstract_<work> */
export function printAbstractOfCost(payload: AbstractExportPayload): void {
  const title = `PWD_Delhi_Abstract_${slugWork(payload.workName)}`;
  openPrintWindow(title, abstractBodyHtml(payload));
}

/** CSV of Abstract rows. */
export function downloadAbstractCsv(payload: AbstractExportPayload): void {
  const lines = [
    ['Particulars', 'Amount'].map(csvEscape).join(','),
    ...payload.rows.map((r) => [csvEscape(r.label), csvEscape(r.value)].join(',')),
  ];
  downloadText(
    `PWD_Delhi_Abstract_${slugWork(payload.workName)}.csv`,
    lines.join('\n'),
    'text/csv;charset=utf-8',
  );
}

/** SOQ CSV from DE lines. */
export function downloadSOQCsv(state: DEEditorState): void {
  const header = ['Code', 'Description', 'Unit', 'Qty', 'Rate', 'Amount'];
  const lines = [
    header.map(csvEscape).join(','),
    ...state.lines.map((line: DELine) =>
      [
        csvEscape(line.code),
        csvEscape(line.description),
        csvEscape(line.unit),
        csvEscape(line.qty),
        csvEscape(line.rate),
        csvEscape(Math.round(lineAmount(line) * 100) / 100),
      ].join(','),
    ),
  ];
  const abs = computeDEAbstract(state);
  lines.push('');
  lines.push(['Works total', '', '', '', '', csvEscape(Math.round(abs.worksTotal))].join(','));
  lines.push([
    `Contingency (${abs.contingencyPct}%)`,
    '',
    '',
    '',
    '',
    csvEscape(Math.round(abs.contingencyAmount)),
  ].join(','));
  lines.push([
    'Grand total (DE)',
    '',
    '',
    '',
    '',
    csvEscape(Math.round(abs.estimatedCost)),
  ].join(','));
  downloadText(
    `PWD_Delhi_SOQ_${slugWork(state.workName)}.csv`,
    lines.join('\n'),
    'text/csv;charset=utf-8',
  );
}

/** Print-friendly SOQ (schedule of quantities). */
export function printSOQ(state: DEEditorState): void {
  const abs = computeDEAbstract(state);
  const bodyRows = state.lines
    .map(
      (line, i) => `<tr>
      <td class="num">${i + 1}</td>
      <td>${escapeHtml(line.code)}</td>
      <td>${escapeHtml(line.description)}</td>
      <td>${escapeHtml(line.unit)}</td>
      <td class="num">${escapeHtml(String(line.qty))}</td>
      <td class="num">${escapeHtml(formatInr(line.rate))}</td>
      <td class="num">${escapeHtml(formatInr(lineAmount(line)))}</td>
    </tr>`,
    )
    .join('');
  const title = `PWD_Delhi_SOQ_${slugWork(state.workName)}`;
  openPrintWindow(
    title,
    `
  <h1>Schedule of Quantities (SOQ) · मात्रा अनुसूची</h1>
  <p class="sub">PWD Delhi · Detailed Estimate</p>
  <div class="meta">
    <div><strong>${escapeHtml(state.workName || 'Untitled DE')}</strong></div>
    <div>${escapeHtml(state.projectName || '—')}</div>
    <div><span class="badge">${escapeHtml(ESTIMATE_STAGE_LABELS[state.stage] ?? 'DE')}</span>
      · ${abs.lineCount} line(s)</div>
  </div>
  <h2>Schedule of Quantities</h2>
  <table>
    <thead>
      <tr>
        <th class="num">#</th>
        <th>Code</th>
        <th>Description</th>
        <th>Unit</th>
        <th class="num">Qty</th>
        <th class="num">Rate (₹)</th>
        <th class="num">Amount (₹)</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows || '<tr><td colspan="7">No lines</td></tr>'}
      <tr class="emph"><td colspan="6">Works total / कार्य योग</td><td class="num">${escapeHtml(formatInr(abs.worksTotal))}</td></tr>
      <tr><td colspan="6">Contingency (${abs.contingencyPct}%) / आकस्मिक व्यय</td><td class="num">${escapeHtml(formatInr(abs.contingencyAmount))}</td></tr>
      <tr class="emph"><td colspan="6">Grand total (DE) / कुल लागत</td><td class="num">${escapeHtml(formatInr(abs.estimatedCost))}</td></tr>
      <tr class="muted"><td colspan="6">GST ${abs.gstPct}% (info) / जीएसटी</td><td class="num">${escapeHtml(formatInr(abs.gstAmount))}</td></tr>
    </tbody>
  </table>`,
  );
}

/** Resolve best abstract payload for a register row (DE preferred, else PE). */
export function abstractPayloadForRegisterItem(
  item: EstimateRegisterItem,
): AbstractExportPayload | null {
  if (item.deDraft && item.deDraft.lines.length > 0) {
    return buildDEAbstractPayload(item.deDraft);
  }
  if (item.deDraft) {
    return buildDEAbstractPayload(item.deDraft);
  }
  if (item.peDraft) {
    return buildPEAbstractPayload(item.peDraft);
  }
  // Synthetic minimal abstract from register amount
  return {
    kind: item.stage === 'de' || item.stage === 'ts' || item.stage === 'nit' ? 'de' : 'pe',
    workName: item.name,
    projectName: item.projectName,
    stageLabel: ESTIMATE_STAGE_LABELS[item.stage],
    extraMeta: item.workDescription,
    rows: [
      {
        label: 'Register amount (no detailed abstract)',
        value: formatInr(item.amountInr),
        emphasize: true,
      },
    ],
    grandTotalLabel: 'Amount',
    grandTotalValue: formatInr(item.amountInr),
  };
}

export function soqStateForRegisterItem(item: EstimateRegisterItem): DEEditorState | null {
  return item.deDraft ?? null;
}
