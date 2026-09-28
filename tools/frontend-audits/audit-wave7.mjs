// Wave 7 — deep-flow probes: BOQ editor + Costs + Validation.
// Goes beyond Waves 1-6 (landing pages) by actually clicking into the work UI
// and calling the underlying API to confirm the round-trip works.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:8090';
const API = `${BASE}/api/v1`;
const SHOTS = path.resolve('qa-shots/audit-wave-7');
fs.mkdirSync(SHOTS, { recursive: true });
const findings = { startedAt: new Date().toISOString(), checks: [] };

async function login() {
  const r = await fetch(`${API}/users/auth/login/`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'v19-e2e@openestimate.com', password: 'OpenEstimate2024!' }),
  });
  return (await r.json()).access_token;
}

(async () => {
  const token = await login();
  const projects = await (await fetch(`${API}/projects/`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const project = projects[0];
  const boqs = await (await fetch(`${API}/boq/boqs/?project_id=${project.id}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const boq = boqs[0];

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const errors = [];
  const networkErrors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text().slice(0, 200)); });
  page.on('response', (r) => {
    const s = r.status();
    const u = r.url().replace(BASE, '');
    if (s >= 400 && !u.includes('favicon')) networkErrors.push(`${s} ${u}`);
  });
  page.on('pageerror', (e) => errors.push(`PAGE: ${e?.message || e}`.slice(0, 200)));

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ token, project }) => {
    localStorage.setItem('oe_access_token', token);
    localStorage.setItem('oe_active_project', JSON.stringify({ id: project.id, name: project.name, boqId: null }));
    localStorage.setItem('oe_onboarding_completed', 'true');
    localStorage.setItem('oe_tour_completed', 'true');
  }, { token, project });

  async function probe(name, fn) {
    errors.length = 0; networkErrors.length = 0;
    const start = Date.now();
    let passed = true; let detail = '';
    try { detail = await fn() ?? ''; } catch (e) { passed = false; detail = `EXC: ${e?.message || e}`; }
    const elapsed = Date.now() - start;
    findings.checks.push({ name, elapsed, passed, detail, errors: [...errors], networkErrors: [...networkErrors] });
    const flag = !passed || errors.length || networkErrors.length ? 'BAD' : 'OK ';
    console.log(`${flag} ${name.padEnd(36)} ${elapsed}ms err=${errors.length} net=${networkErrors.length} ${detail}`);
  }

  // 1. BOQ list page
  await probe('boq-list', async () => {
    await page.goto(`${BASE}/boq`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SHOTS, 'boq-list.png') });
    const cards = await page.locator('a[href*="/boq/"], [data-testid="boq-card"]').count();
    return `cards=${cards}`;
  });

  // 2. BOQ editor opens
  await probe('boq-editor-open', async () => {
    await page.goto(`${BASE}/boq/${boq.id}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(SHOTS, 'boq-editor.png') });
    const gridRows = await page.locator('.ag-row').count();
    return `grid_rows=${gridRows}`;
  });

  // 3. BOQ positions API
  await probe('boq-positions-api', async () => {
    const r = await fetch(`${API}/boq/${boq.id}/positions/`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    return `positions=${Array.isArray(d) ? d.length : 'object'}`;
  });

  // 4. Costs page
  await probe('costs-page', async () => {
    await page.goto(`${BASE}/costs`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SHOTS, 'costs.png') });
    const rows = await page.locator('.ag-row, tbody tr, [role="row"]').count();
    return `rows=${rows}`;
  });

  // 5. Costs API search
  await probe('costs-api-search', async () => {
    const r = await fetch(`${API}/costs/items/?q=concrete&limit=5`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const items = d.items || d;
    return `concrete_results=${Array.isArray(items) ? items.length : 'obj'}`;
  });

  // 6. Validation page
  await probe('validation-page', async () => {
    await page.goto(`${BASE}/validation`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(SHOTS, 'validation.png') });
    return '';
  });

  // 7. Validation rules API
  await probe('validation-rules-api', async () => {
    const r = await fetch(`${API}/validation/rules/`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const rules = d.rules || d;
    return `rules=${Array.isArray(rules) ? rules.length : 'obj'}`;
  });

  // 8. Run validation engine on the BOQ
  await probe('validation-engine-run', async () => {
    const r = await fetch(`${API}/validation/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ project_id: project.id, target: 'boq', target_id: boq.id }),
    });
    if (!r.ok) {
      const text = await r.text();
      return `HTTP ${r.status}: ${text.slice(0, 80)}`;
    }
    const d = await r.json();
    return `score=${d.score ?? d?.report?.score ?? '?'}`;
  });

  // 9. Resource catalog
  await probe('catalog-page', async () => {
    await page.goto(`${BASE}/catalog`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SHOTS, 'catalog.png') });
    return '';
  });

  // 10. Reporting page
  await probe('reporting-page', async () => {
    await page.goto(`${BASE}/reports`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: path.join(SHOTS, 'reports.png') });
    return '';
  });

  findings.endedAt = new Date().toISOString();
  fs.writeFileSync(path.join(SHOTS, 'findings.json'), JSON.stringify(findings, null, 2));
  const bad = findings.checks.filter((c) => !c.passed || c.errors.length || c.networkErrors.length);
  console.log(`\nWAVE 7: ${bad.length}/${findings.checks.length} checks with issues`);
  for (const c of bad) {
    console.log(`  ${c.name}: passed=${c.passed} err=${c.errors.length} net=${c.networkErrors.length}`);
    for (const e of c.errors) console.log(`    CON: ${e}`);
    for (const n of c.networkErrors) console.log(`    NET: ${n}`);
  }

  await browser.close();
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
