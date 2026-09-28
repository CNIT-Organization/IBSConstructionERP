// Wave 6 follow-up: verify files.* translations land for fr/es/pt/zh/hi/ja/ar.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:8090';
const API = `${BASE}/api/v1`;
const SHOTS = path.resolve('qa-shots/audit-wave-6-langs');
fs.mkdirSync(SHOTS, { recursive: true });

const LANGS = ['ar', 'fr', 'es', 'pt', 'zh', 'hi', 'ja'];

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

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ token, project }) => {
    localStorage.setItem('oe_access_token', token);
    localStorage.setItem('oe_active_project', JSON.stringify({ id: project.id, name: project.name, boqId: null }));
    localStorage.setItem('oe_onboarding_completed', 'true');
    localStorage.setItem('oe_tour_completed', 'true');
  }, { token, project });

  const summary = [];
  for (const lng of LANGS) {
    await page.evaluate((l) => { localStorage.setItem('i18nextLng', l); }, lng);
    await page.goto(`${BASE}/files`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1300);
    await page.screenshot({ path: path.join(SHOTS, `files-${lng}.png`) });
    // Count untranslated leak words inside the visible content
    const leak = await page.locator('main >> text=/^(Documents|Photos|Drawings|Reports|Upload files|Search|Total Value|Files|All files|Categories|Project Files|All|Total)$/').count();
    summary.push({ lng, leak });
    console.log(`${lng}: leak=${leak}`);
  }

  fs.writeFileSync(path.join(SHOTS, 'summary.json'), JSON.stringify(summary, null, 2));
  await browser.close();
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
