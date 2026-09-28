// Wave 5 — focused on REAL sidebar routes + perf + i18n gaps.
//
// Routes pulled directly from frontend/src/app/layout/Sidebar.tsx (verified
// line numbers in commit ffb221ed).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:8090';
const API = `${BASE}/api/v1`;
const SHOTS = path.resolve('qa-shots/audit-wave-5');
fs.mkdirSync(SHOTS, { recursive: true });
const findings = { startedAt: new Date().toISOString(), routes: [] };

async function login() {
  const r = await fetch(`${API}/users/auth/login/`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'v19-e2e@openestimate.com', password: 'OpenEstimate2024!' }),
  });
  return (await r.json()).access_token;
}

const ROUTES = [
  ['catalog',         '/catalog'],
  ['quantity-rules',  '/bim/rules'],                       // sidebar alias
  ['data-explorer',   '/data-explorer'],
  ['bim-rules-req',   '/bim/rules?mode=requirements'],
  ['advisor',         '/advisor'],
  ['project-intelligence', '/project-intelligence'],
  ['erp-chat',        '/chat'],
  ['5d',              '/5d'],
  ['risks',           '/risks'],
  ['procurement',     '/procurement'],
  ['change-orders',   '/changeorders'],
  ['contacts',        '/contacts'],
  ['rfi',             '/rfi'],
  ['submittals',      '/submittals'],
  ['transmittals',    '/transmittals'],
  ['correspondence',  '/correspondence'],
  ['assets',          '/assets'],
  ['cde',             '/cde'],
  ['photos',          '/photos'],
  ['markups',         '/markups'],
  ['field-reports',   '/field-reports'],
  ['reports',         '/reports'],
  ['validation',      '/validation'],
  ['inspections',     '/inspections'],
  ['ncr',             '/ncr'],
  ['safety',          '/safety'],
  ['punchlist',       '/punchlist'],
];

(async () => {
  const token = await login();
  const projects = await (await fetch(`${API}/projects/`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const project = projects[0];

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const errors = [];
  const networkErrors = [];
  const slow = [];
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text().slice(0, 200)); });
  page.on('response', (r) => {
    const s = r.status();
    const u = r.url().replace(BASE, '');
    if (s >= 400 && !u.includes('favicon')) networkErrors.push(`${s} ${u}`);
    const t = r.timing?.();
    if (t && t.responseEnd > 4000) slow.push(`${Math.round(t.responseEnd)}ms ${u}`);
  });
  page.on('pageerror', (e) => errors.push(`PAGE: ${e?.message || e}`.slice(0, 200)));

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ token, project }) => {
    localStorage.setItem('oe_access_token', token);
    localStorage.setItem('oe_active_project', JSON.stringify({ id: project.id, name: project.name, boqId: null }));
    localStorage.setItem('oe_onboarding_completed', 'true');
    localStorage.setItem('oe_tour_completed', 'true');
  }, { token, project });

  for (const [slug, route] of ROUTES) {
    errors.length = 0; networkErrors.length = 0; slow.length = 0;
    const start = Date.now();
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1500);
    } catch (e) {
      errors.push(`NAV: ${e?.message || e}`);
    }
    const elapsed = Date.now() - start;
    const file = path.join(SHOTS, `${slug}.png`);
    await page.screenshot({ path: file, fullPage: false }).catch(() => {});

    // Detect 404 page
    const is404 = await page.locator('text=Page not found').count() > 0;

    findings.routes.push({
      slug, route, elapsed,
      errors: [...errors],
      networkErrors: [...networkErrors],
      slow: [...slow],
      is404,
    });

    const tag = is404 ? '404' : (errors.length || networkErrors.length ? 'ERR' : 'OK ');
    console.log(`${tag} ${route.padEnd(40)} ${elapsed}ms  err=${errors.length} net=${networkErrors.length} slow=${slow.length}`);
    if (slow.length) for (const s of slow) console.log(`   SLOW: ${s}`);
  }

  findings.endedAt = new Date().toISOString();
  fs.writeFileSync(path.join(SHOTS, 'findings.json'), JSON.stringify(findings, null, 2));
  const dead = findings.routes.filter((r) => r.is404 || r.networkErrors.length || r.errors.length);
  console.log(`\nWAVE 5: ${dead.length}/${findings.routes.length} routes with issues`);
  for (const d of dead) {
    console.log(`  ${d.route} → ${d.is404 ? '404 page' : `${d.errors.length} con err / ${d.networkErrors.length} net err`}`);
  }

  await browser.close();
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
