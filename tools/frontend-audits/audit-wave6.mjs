// Wave 6 — file-manager interactions + RTL/i18n leakage + BIM workflow.
//
// Targets gaps surfaced after Wave 5: file-manager folder cards, deeplink
// open-in-module path, RTL string coverage in Arabic, and BIM Hub round-trip.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:8090';
const API = `${BASE}/api/v1`;
const SHOTS = path.resolve('qa-shots/audit-wave-6');
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
    console.log(`${flag} ${name.padEnd(40)} ${elapsed}ms err=${errors.length} net=${networkErrors.length} ${detail}`);
  }

  // 1. Files folder-card grid
  await probe('files-folder-grid', async () => {
    await page.goto(`${BASE}/files`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SHOTS, 'files-folder-grid.png') });
    const cards = await page.locator('[role="button"], button, a').filter({ hasText: /Documents|Photos|Drawings|BIM|Reports/ }).count();
    return `cards=${cards}`;
  });

  // 2. Click into Documents folder
  await probe('files-documents-folder', async () => {
    await page.goto(`${BASE}/files?kind=document`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SHOTS, 'files-documents.png') });
    const rowCount = await page.locator('text=Project Brief, text=PDF, text=Drawing').count();
    return `rows=${rowCount}`;
  });

  // 3. Photos folder
  await probe('files-photos-folder', async () => {
    await page.goto(`${BASE}/files?kind=photo`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SHOTS, 'files-photos.png') });
    return '';
  });

  // 4. BIM models folder
  await probe('files-bim-folder', async () => {
    await page.goto(`${BASE}/files?kind=bim_model`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SHOTS, 'files-bim.png') });
    return '';
  });

  // 5. Upload dialog opens (no size cap text)
  await probe('files-upload-dialog', async () => {
    await page.goto(`${BASE}/files?kind=document`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1000);
    const uploadBtn = page.getByRole('button', { name: /upload/i }).first();
    if (await uploadBtn.count() === 0) return 'no upload button';
    await uploadBtn.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SHOTS, 'files-upload-dialog.png') });
    const sizeHint = await page.locator('text=/100 ?mb|max ?file|размер|maximum/i').count();
    return `sizeHint=${sizeHint}`;
  });

  // 6. RTL Arabic — verify translations actually load
  await probe('rtl-arabic-files', async () => {
    await page.evaluate(() => { localStorage.setItem('i18nextLng', 'ar'); });
    await page.goto(`${BASE}/files`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SHOTS, 'rtl-arabic-files.png') });
    const dir = await page.evaluate(() => document.documentElement.getAttribute('dir'));
    const lang = await page.evaluate(() => document.documentElement.getAttribute('lang'));
    // Count English-looking words in main content (rough leakage detector)
    const englishLeak = await page.locator('main >> text=/^(Documents|Photos|Drawings|Reports|Upload|Search|Total Value|Files|All)$/').count();
    return `dir=${dir} lang=${lang} eng-leak=${englishLeak}`;
  });

  // 7. BIM Hub list
  await probe('bim-hub-list', async () => {
    await page.evaluate(() => { localStorage.setItem('i18nextLng', 'en'); });
    await page.goto(`${BASE}/bim`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SHOTS, 'bim-hub.png') });
    return '';
  });

  // 8. BIM viewer (sample model if present)
  await probe('bim-viewer-sample', async () => {
    const models = await fetch(`${API}/bim/models?project_id=${project.id}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => []);
    if (!Array.isArray(models) || models.length === 0) return 'no models';
    await page.goto(`${BASE}/bim/${models[0].id}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(SHOTS, 'bim-viewer.png') });
    return `model=${models[0].id?.slice(0, 8)}`;
  });

  // 9. DWG takeoff page
  await probe('dwg-takeoff', async () => {
    await page.goto(`${BASE}/dwg-takeoff`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SHOTS, 'dwg-takeoff.png') });
    return '';
  });

  // 10. /takeoff PDF takeoff
  await probe('takeoff-pdf', async () => {
    await page.goto(`${BASE}/takeoff`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SHOTS, 'takeoff.png') });
    return '';
  });

  // 11. Settings
  await probe('settings', async () => {
    await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SHOTS, 'settings.png') });
    return '';
  });

  // 12. Profile
  await probe('profile', async () => {
    await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SHOTS, 'profile.png') });
    return '';
  });

  findings.endedAt = new Date().toISOString();
  fs.writeFileSync(path.join(SHOTS, 'findings.json'), JSON.stringify(findings, null, 2));
  const bad = findings.checks.filter((c) => !c.passed || c.errors.length || c.networkErrors.length);
  console.log(`\nWAVE 6: ${bad.length}/${findings.checks.length} checks with issues`);
  for (const c of bad) {
    console.log(`  ${c.name}: passed=${c.passed} err=${c.errors.length} net=${c.networkErrors.length}`);
    for (const e of c.errors) console.log(`    CON: ${e}`);
    for (const n of c.networkErrors) console.log(`    NET: ${n}`);
  }

  await browser.close();
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
