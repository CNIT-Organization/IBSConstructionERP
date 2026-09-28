// Wave 4 — interaction probes: drive forms, dialogs, edits.  Find broken
// submit handlers, validation glitches, save failures.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:8090';
const API = `${BASE}/api/v1`;
const SHOTS = path.resolve('qa-shots/audit-wave-4');
fs.mkdirSync(SHOTS, { recursive: true });
const findings = { startedAt: new Date().toISOString(), flows: [] };

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

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const errors = [];
  const networkErrors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text().slice(0, 200)); });
  page.on('response', (r) => { const s = r.status(); if (s >= 400 && !r.url().includes('favicon')) networkErrors.push(`${s} ${r.url().replace(BASE, '')}`); });
  page.on('pageerror', (e) => errors.push(`PAGE: ${e?.message || e}`.slice(0, 200)));

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ token, project }) => {
    localStorage.setItem('oe_access_token', token);
    localStorage.setItem('oe_active_project', JSON.stringify({ id: project.id, name: project.name, boqId: null }));
    localStorage.setItem('oe_onboarding_completed', 'true');
  }, { token, project });

  async function flow(name, fn) {
    errors.length = 0; networkErrors.length = 0;
    try { await fn(); } catch (e) { errors.push(`THROW: ${e?.message || e}`); }
    const file = path.join(SHOTS, `${name}.png`);
    await page.screenshot({ path: file }).catch(() => {});
    findings.flows.push({ name, errors: [...errors], networkErrors: [...networkErrors] });
    console.log(`${name}: errors=${errors.length} net=${networkErrors.length}`);
    if (errors.length) errors.forEach((e) => console.log(`  E: ${e}`));
    if (networkErrors.length) networkErrors.forEach((n) => console.log(`  N: ${n}`));
  }

  // 1. Open BOQ → click first estimate → check if it loads + Add position dialog
  await flow('01-boq-open-estimate', async () => {
    await page.goto(`${BASE}/boq`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const cards = page.locator('a[href^="/boq/"]:not([href$="/boq"])').filter({ hasText: /Estim/i });
    const cnt = await cards.count();
    if (cnt > 0) {
      const href = await cards.first().getAttribute('href');
      console.log(`  → BOQ cards=${cnt}, opening ${href}`);
      await cards.first().click();
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(2500);
    }
  });

  // 2. Click "+ New Estimate" — opens create dialog?
  await flow('02-boq-new-estimate-dialog', async () => {
    await page.goto(`${BASE}/boq`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
    const btn = page.locator('button', { hasText: /New Estimate/i }).first();
    if (await btn.count()) {
      await btn.click();
      await page.waitForTimeout(1500);
    }
  });

  // 3. Click "+ New Project" from /projects
  await flow('03-projects-new-project-dialog', async () => {
    await page.goto(`${BASE}/projects`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
    const btn = page.locator('button, a', { hasText: /New Project/i }).first();
    if (await btn.count()) { await btn.click(); await page.waitForTimeout(1500); }
  });

  // 4. Costs search
  await flow('04-costs-search-and-row-click', async () => {
    await page.goto(`${BASE}/costs`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const search = page.locator('input[type="search"], input[placeholder*="Search" i]').first();
    if (await search.count()) {
      await search.fill('beton');
      await page.waitForTimeout(2500);
    }
    const firstRow = page.locator('table tbody tr, [role="row"]').first();
    if (await firstRow.count()) await firstRow.click({ trial: true }).catch(() => {});
  });

  // 5. Open settings tabs
  await flow('05-settings-tabs', async () => {
    await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
    for (const tab of ['Account', 'Regional', 'BIM / CAD', 'AI', 'Integrations', 'Advanced']) {
      const t = page.locator('button, a', { hasText: tab }).first();
      if (await t.count()) { await t.click(); await page.waitForTimeout(800); }
    }
  });

  // 6. Validation — pick BOQ + click Run Validation
  await flow('06-validation-run', async () => {
    await page.goto(`${BASE}/validation`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
    const select = page.locator('select').nth(1);
    if (await select.count()) {
      const opts = await select.locator('option').count();
      if (opts > 1) await select.selectOption({ index: 1 });
      await page.waitForTimeout(1000);
    }
    const run = page.locator('button', { hasText: /Run Validation/i }).first();
    if (await run.count()) { await run.click(); await page.waitForTimeout(4500); }
  });

  // 7. Open AI Estimate
  await flow('07-ai-estimate-input', async () => {
    await page.goto(`${BASE}/ai-estimate`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
    const txt = page.locator('textarea').first();
    if (await txt.count()) {
      await txt.fill('Two-storey concrete house, 200 m², Berlin, EUR.');
      await page.waitForTimeout(800);
    }
  });

  // 8. Modules page — toggle a module
  await flow('08-modules-toggle', async () => {
    await page.goto(`${BASE}/modules`, { waitUntil: 'networkidle', timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const toggle = page.locator('button[role="switch"], input[type="checkbox"]').first();
    if (await toggle.count()) await toggle.click({ trial: true }).catch(() => {});
  });

  // 9. User Management — Invite User dialog
  await flow('09-users-invite-dialog', async () => {
    await page.goto(`${BASE}/users`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
    const btn = page.locator('button', { hasText: /Invite User/i }).first();
    if (await btn.count()) { await btn.click(); await page.waitForTimeout(1500); }
  });

  // 10. Photos — upload area + filters
  await flow('10-photos-list', async () => {
    await page.goto(`${BASE}/photos`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);
  });

  // 11. RFI — New RFI
  await flow('11-rfi-new-dialog', async () => {
    await page.goto(`${BASE}/rfi`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
    const btn = page.locator('button', { hasText: /New RFI|Create RFI/i }).first();
    if (await btn.count()) { await btn.click(); await page.waitForTimeout(1500); }
  });

  // 12. Tasks — New Task
  await flow('12-task-new-dialog', async () => {
    await page.goto(`${BASE}/tasks`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
    const btn = page.locator('button', { hasText: /New Task|Create Task|Add Task/i }).first();
    if (await btn.count()) { await btn.click(); await page.waitForTimeout(1500); }
  });

  // 13. Schedule
  await flow('13-schedule-create', async () => {
    await page.goto(`${BASE}/schedule`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
    const btn = page.locator('button', { hasText: /Create Schedule|New Schedule/i }).first();
    if (await btn.count()) { await btn.click(); await page.waitForTimeout(2000); }
  });

  // 14. Finance — New Budget Line
  await flow('14-finance-new-budget', async () => {
    await page.goto(`${BASE}/finance`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
    const btn = page.locator('button', { hasText: /New Budget Line/i }).first();
    if (await btn.count()) { await btn.click(); await page.waitForTimeout(1500); }
  });

  // 15. Tendering — package detail
  await flow('15-tendering-package-detail', async () => {
    await page.goto(`${BASE}/tendering`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
    const card = page.locator('a[href*="/tendering/"], button[role="link"]').first();
    if (await card.count()) await card.click({ trial: true }).catch(() => {});
  });

  findings.endedAt = new Date().toISOString();
  fs.writeFileSync(path.join(SHOTS, 'findings.json'), JSON.stringify(findings, null, 2));
  const totalErr = findings.flows.reduce((s, f) => s + f.errors.length + f.networkErrors.length, 0);
  console.log(`\nWAVE 4 TOTAL ISSUES: ${totalErr} across ${findings.flows.length} flows`);
  await browser.close();
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
