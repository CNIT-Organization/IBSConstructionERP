/**
 * PWD Delhi — Planning vs Engineer wing roles (demo product RBAC).
 *
 * Prefer authenticated JWT `role` / email when it is `planning` or `engineer`.
 * Fall back to localStorage DemoRoleSwitcher until smoke PASS / for admin demos.
 * Not GNCTD production org hierarchy — just the two wings for this product.
 *
 * Split follows docs/PWD_DELHI_UI_PLAN.md:
 *   - Planning: PE wizard, early stage advance (Rough → PE → AA/ES), Abstract view,
 *     AA/ES sanction note. Not DE deep-edit or late T/S / NIT advance.
 *   - Engineer: DE editor + DSR, DE → T/S → NIT advance, T/S sanction notes,
 *     Abstract/SOQ export. Not PE create/edit or early Planning advances.
 */

import type { EstimateStage } from './types';
import { ESTIMATE_STAGE_LABELS } from './types';

export type DemoWingRole = 'planning' | 'engineer';

export const DEMO_WING_STORAGE_KEY = 'pwd_delhi_demo_wing_role';

/** When set to "1", show DemoRoleSwitcher even if JWT carries a wing role. */
export const DEMO_WING_OVERRIDE_KEY = 'pwd_delhi_demo_wing_override';

/** Custom event so pages update when the switcher changes role in-tab. */
export const DEMO_WING_CHANGE_EVENT = 'pwd-delhi-demo-wing-change';

export const DEMO_ROLE_LABELS: Record<
  DemoWingRole,
  { en: string; hi: string; short: string }
> = {
  planning: { en: 'Planning', hi: 'योजना', short: 'Planning' },
  engineer: { en: 'Engineer', hi: 'अभियंता', short: 'Engineer' },
};

export const DEMO_ROLE_BANNER =
  'Demo roles only — not GNCTD production RBAC · डेमो भूमिकाएँ — वास्तविक आरबीएसी नहीं';

const DEFAULT_ROLE: DemoWingRole = 'planning';

const AUTH_WING_EMAILS: Record<string, DemoWingRole> = {
  'planning@openestimator.io': 'planning',
  'engineer@openestimator.io': 'engineer',
};

/** Map JWT role claim (or email) → wing role, or null if not a wing login. */
export function resolveAuthWingRole(
  role: string | null | undefined,
  email?: string | null,
): DemoWingRole | null {
  const r = (role ?? '').trim().toLowerCase();
  if (r === 'planning' || r === 'engineer') return r;
  const e = (email ?? '').trim().toLowerCase();
  if (e && e in AUTH_WING_EMAILS) return AUTH_WING_EMAILS[e]!;
  return null;
}

export function isDemoWingOverrideEnabled(): boolean {
  try {
    if (localStorage.getItem(DEMO_WING_OVERRIDE_KEY) === '1') return true;
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get('demoWingOverride') === '1') return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

export function loadDemoWingRole(): DemoWingRole {
  try {
    const raw = localStorage.getItem(DEMO_WING_STORAGE_KEY);
    if (raw === 'planning' || raw === 'engineer') return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_ROLE;
}

export function saveDemoWingRole(role: DemoWingRole): void {
  try {
    localStorage.setItem(DEMO_WING_STORAGE_KEY, role);
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(DEMO_WING_CHANGE_EVENT, { detail: { role } }),
    );
  }
}

/**
 * Effective wing for gates: JWT planning/engineer wins unless demo override
 * is on; otherwise localStorage switcher (default Planning).
 */
export function getEffectiveWingRole(
  authRole?: string | null,
  authEmail?: string | null,
): DemoWingRole {
  const fromAuth = resolveAuthWingRole(authRole, authEmail);
  if (fromAuth && !isDemoWingOverrideEnabled()) return fromAuth;
  return loadDemoWingRole();
}

/** Stages this demo wing may advance FROM (into the next stage). */
export function canAdvanceFromStage(
  role: DemoWingRole,
  from: EstimateStage,
): boolean {
  if (role === 'planning') {
    return from === 'rough' || from === 'pe';
  }
  // Engineer: AA/ES → DE, DE → T/S, T/S → NIT
  return from === 'aa_es' || from === 'de' || from === 'ts';
}

export function advanceBlockedReason(
  role: DemoWingRole,
  from: EstimateStage,
): string | null {
  if (canAdvanceFromStage(role, from)) return null;
  const next = ESTIMATE_STAGE_LABELS[from];
  if (role === 'planning') {
    return `Planning cannot advance past AA/ES (blocked at ${next}). Login as Engineer · योजना भूमिका बाद के चरण नहीं बढ़ा सकती — अभियंता से लॉगिन करें`;
  }
  return `Engineer cannot advance early stages (${next}). Login as Planning · अभियंता भूमिका प्रारंभिक चरण नहीं बढ़ा सकती — योजना से लॉगिन करें`;
}

export function canCreateOrEditPE(role: DemoWingRole): boolean {
  return role === 'planning';
}

export function peEditBlockedReason(role: DemoWingRole): string | null {
  if (canCreateOrEditPE(role)) return null;
  return 'PE create/edit is a Planning affordance. Login as Planning · पीई संपादन योजना भूमिका के लिए है';
}

export function canCreateOrEditDE(role: DemoWingRole): boolean {
  return role === 'engineer';
}

export function deEditBlockedReason(role: DemoWingRole): string | null {
  if (canCreateOrEditDE(role)) return null;
  return 'DE deep-edit / DSR pick is an Engineer affordance. Login as Engineer · डीई संपादन अभियंता भूमिका के लिए है';
}

/** Engineer (demo) may import/replace Delhi DSR CSV or Excel; Planning may view rates only. */
export function canImportDsrCatalog(role: DemoWingRole): boolean {
  return role === 'engineer';
}

export function dsrImportBlockedReason(role: DemoWingRole): string | null {
  if (canImportDsrCatalog(role)) return null;
  return 'DSR catalog import is an Engineer affordance. Login as Engineer · डीएसआर आयात अभियंता भूमिका के लिए है';
}

/** Both wings may view Abstract / SOQ exports. */
export function canExportAbstractSoq(_role: DemoWingRole): boolean {
  return true;
}

/** Planning edits AA/ES note; Engineer edits T/S + power notes. */
export function canEditAaEsNote(role: DemoWingRole): boolean {
  return role === 'planning';
}

export function canEditTsSanctionNotes(role: DemoWingRole): boolean {
  return role === 'engineer';
}

export function aaEsNoteBlockedReason(role: DemoWingRole): string | null {
  if (canEditAaEsNote(role)) return null;
  return 'AA/ES notes are a Planning field. Login as Planning · एए/ईएस नोट योजना के लिए है';
}

export function tsSanctionBlockedReason(role: DemoWingRole): string | null {
  if (canEditTsSanctionNotes(role)) return null;
  return 'T/S & power notes are an Engineer field. Login as Engineer · टी/एस नोट अभियंता के लिए है';
}

export function canSaveAnySanction(role: DemoWingRole): boolean {
  return canEditAaEsNote(role) || canEditTsSanctionNotes(role);
}
