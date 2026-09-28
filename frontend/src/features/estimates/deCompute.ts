/**
 * Client-side DE Abstract of Cost from schedule / NS lines.
 * Formula: Σ(qty × rate) + contingency%; GST 18% informational.
 */

import {
  GST_WORKS_PCT,
  type DEAbstractOfCost,
  type DEEditorState,
  type DELine,
  type NSRateAnalysis,
} from './types';

export function lineAmount(line: Pick<DELine, 'qty' | 'rate'>): number {
  const qty = Math.max(0, Number(line.qty) || 0);
  const rate = Math.max(0, Number(line.rate) || 0);
  return qty * rate;
}

export function nsRateFromAnalysis(ns: NSRateAnalysis | null | undefined): number {
  if (!ns) return 0;
  return (
    Math.max(0, Number(ns.labour) || 0) +
    Math.max(0, Number(ns.material) || 0) +
    Math.max(0, Number(ns.overhead) || 0)
  );
}

export function computeDEAbstract(
  state: Pick<DEEditorState, 'lines' | 'contingencyPct'>,
): DEAbstractOfCost {
  const lines = state.lines ?? [];
  const worksTotal = lines.reduce((sum, line) => sum + lineAmount(line), 0);
  const contingencyPct = Math.max(0, Number(state.contingencyPct) || 0);
  const contingencyAmount = worksTotal * (contingencyPct / 100);
  const estimatedCost = worksTotal + contingencyAmount;
  const gstPct = GST_WORKS_PCT;
  const gstAmount = estimatedCost * (gstPct / 100);
  const totalWithGstInfo = estimatedCost + gstAmount;

  return {
    worksTotal,
    contingencyPct,
    contingencyAmount,
    estimatedCost,
    gstPct,
    gstAmount,
    totalWithGstInfo,
    lineCount: lines.length,
  };
}
