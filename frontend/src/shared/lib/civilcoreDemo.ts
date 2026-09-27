/**
 * CivilCore demo profile — hides AI navigation while keeping routes intact.
 * Enabled when `CIVILCORE_DEMO=true` (backend) and/or `VITE_CIVILCORE_DEMO=true`
 * (frontend build). Backend flag is mirrored on GET /api/health.
 */

/** Module / nav keys hidden when CivilCore demo mode is active. */
export const CIVILCORE_DEMO_HIDDEN_MODULE_KEYS = new Set([
  'ai-estimate',
  'advisor',
  'project-intelligence',
  'erp-chat',
]);

/** Route prefixes hidden from sidebar and command palette in demo mode. */
export const CIVILCORE_DEMO_HIDDEN_ROUTES = new Set([
  '/ai-estimate',
  '/advisor',
  '/chat',
  '/project-intelligence',
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

export function isRouteHiddenInCivilCoreDemo(path: string): boolean {
  if (!isCivilCoreDemo()) return false;
  for (const prefix of CIVILCORE_DEMO_HIDDEN_ROUTES) {
    if (path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`)) {
      return true;
    }
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
    if (!res.ok) return isCivilCoreDemo();
    const data = (await res.json()) as { civilcore_demo?: boolean };
    if (data.civilcore_demo === true) {
      setCivilCoreDemoFromServer(true);
    }
  } catch {
    /* offline or API not up — env flag still applies */
  }
  return isCivilCoreDemo();
}
