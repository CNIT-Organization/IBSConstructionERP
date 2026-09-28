/**
 * CivilCore / PWD Delhi demo profile — nav allowlist + theme hook.
 * Enabled when `CIVILCORE_DEMO=true` (backend) and/or `VITE_CIVILCORE_DEMO=true`
 * (frontend build). Backend flag is mirrored on GET /api/health.
 *
 * Phase A (PWD Delhi Works Estimating): show only Planning+Engineer tools;
 * hide marketplace / AI / CRM / HSE deep / carbon / non-India noise.
 */

/** Module / nav keys hidden when CivilCore demo mode is active (legacy hide-list). */
export const CIVILCORE_DEMO_HIDDEN_MODULE_KEYS = new Set([
  'ai-estimate',
  'advisor',
  'project-intelligence',
  'erp-chat',
  'crm',
  'carbon',
  'hse-advanced',
  'property-dev',
  'bid-management',
]);

/**
 * Nav allowlist for PWD Delhi Phase A (plan: Dashboard · Projects · Estimates
 * · Cost/DSR · Takeoff · Reports · Settings). Paths are matched as prefixes
 * unless exact-only is needed for `/`.
 */
export const PWD_DELHI_NAV_ALLOWLIST: readonly string[] = [
  '/',
  '/projects',
  '/estimates',
  '/boq',
  '/costs',
  '/takeoff',
  '/reports',
  '/settings',
];

/** Route prefixes always hidden from sidebar / command palette in demo mode. */
export const CIVILCORE_DEMO_HIDDEN_ROUTES = new Set([
  '/ai-estimate',
  '/advisor',
  '/chat',
  '/project-intelligence',
  '/crm',
  '/carbon',
  '/hse-advanced',
  '/property-dev',
  '/bid-management',
  '/modules',
  '/about',
  '/users',
  '/files',
  '/match-elements',
  '/assemblies',
  '/catalog',
  '/bim',
  '/dwg-takeoff',
  '/data-explorer',
  '/schedule',
  '/schedule-advanced',
  '/tasks',
  '/5d',
  '/risks',
  '/daily-diary',
  '/equipment',
  '/resources',
  '/service',
  '/portal',
  '/finance',
  '/procurement',
  '/tendering',
  '/changeorders',
  '/contracts',
  '/subcontractors',
  '/variations',
  '/supplier-catalogs',
  '/contacts',
  '/meetings',
  '/rfi',
  '/submittals',
  '/transmittals',
  '/correspondence',
  '/assets',
  '/cde',
  '/photos',
  '/markups',
  '/field-reports',
  '/validation',
  '/inspections',
  '/ncr',
  '/safety',
  '/punchlist',
  '/qms',
  '/bi-dashboards',
  '/modules/developer-guide',
]);

function envDemoFlag(): boolean {
  return import.meta.env.VITE_CIVILCORE_DEMO === 'true';
}

let serverDemoFlag: boolean | null = null;

export function setCivilCoreDemoFromServer(enabled: boolean): void {
  serverDemoFlag = enabled ? true : serverDemoFlag;
}

/** Synchronous check (env at build time + optional server flag after health fetch). */
export function isCivilCoreDemo(): boolean {
  if (envDemoFlag()) return true;
  return serverDemoFlag === true;
}

/** Apply / remove `pwd-delhi` on <html> for theme tokens (navy / saffron / page bg). */
export function applyPwdDelhiThemeClass(enabled: boolean = isCivilCoreDemo()): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('pwd-delhi', enabled);
}

export function isRouteHiddenInCivilCoreDemo(path: string): boolean {
  if (!isCivilCoreDemo()) return false;
  const bare = path.split('?')[0] ?? path;
  for (const prefix of CIVILCORE_DEMO_HIDDEN_ROUTES) {
    if (bare === prefix || bare.startsWith(`${prefix}/`) || bare.startsWith(`${prefix}?`)) {
      return true;
    }
  }
  return false;
}

/** True when path is on the PWD Delhi Phase A allowlist. */
export function isRouteAllowedInPwdDemo(path: string): boolean {
  if (!isCivilCoreDemo()) return true;
  const bare = (path.split('?')[0] ?? path) || '/';
  for (const allowed of PWD_DELHI_NAV_ALLOWLIST) {
    if (allowed === '/') {
      if (bare === '/') return true;
      continue;
    }
    if (bare === allowed || bare.startsWith(`${allowed}/`)) return true;
  }
  return false;
}

export function isModuleHiddenInCivilCoreDemo(moduleKey: string): boolean {
  return isCivilCoreDemo() && CIVILCORE_DEMO_HIDDEN_MODULE_KEYS.has(moduleKey);
}

/** Load `civilcore_demo` from GET /api/health (Docker / runtime config). */
export async function syncCivilCoreDemoFromHealth(): Promise<boolean> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) {
      applyPwdDelhiThemeClass();
      return isCivilCoreDemo();
    }
    const data = (await res.json()) as { civilcore_demo?: boolean };
    if (data.civilcore_demo === true) {
      setCivilCoreDemoFromServer(true);
    }
  } catch {
    /* offline or API not up — env flag still applies */
  }
  applyPwdDelhiThemeClass();
  return isCivilCoreDemo();
}
