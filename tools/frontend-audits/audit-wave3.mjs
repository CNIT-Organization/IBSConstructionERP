// Wave 3 — cross-cutting: i18n switching, light/dark theme, responsive
// breakpoints, error states.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:8090';
const API = `${BASE}/api/v1`;
const SHOTS = path.resolve('qa-shots/audit-wave-3');
fs.mkdirSync(SHOTS, { recursive: true });

const findings = { startedAt: new Date().toISOString(), shots: [] };

async function login() {
  const r = await fetch(`${API}/users/auth/login/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'v19-e2e@openestimate.com', password: 'OpenEstimate2024!' }),
  });
  return (await r.json()).access_token;
}

async function shoot(page, name) {
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false }).catch(() => {});
  findings.shots.push(file);
  console.log(`  → ${name}`);
}

(async () => {
  const token = await login();
  const projects = await (await fetch(`${API}/projects/`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const project = projects[0];

  const browser = await chromium.launch({ headless: true });

  // i18n probe — render dashboard in 4 languages
  for (const [lang, label] of [['en', 'en'], ['fr', 'fr'], ['de', 'de'], ['ar', 'ar']]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ token, project, lang }) => {
      localStorage.setItem('oe_access_token', token);
      localStorage.setItem('oe_active_project', JSON.stringify({ id: project.id, name: project.name, boqId: null }));
      localStorage.setItem('oe_onboarding_completed', 'true');
      localStorage.setItem('i18nextLng', lang);
      document.documentElement.lang = lang;
      if (lang === 'ar') document.documentElement.dir = 'rtl';
    }, { token, project, lang });
    await page.goto(`${BASE}/projects`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await shoot(page, `i18n-${label}-projects`);
    await page.goto(`${BASE}/boq`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await shoot(page, `i18n-${label}-boq`);
    await page.close();
    await ctx.close();
  }

  // Theme probe — light + dark
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: theme === 'dark' ? 'dark' : 'light',
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ token, project, theme }) => {
      localStorage.setItem('oe_access_token', token);
      localStorage.setItem('oe_active_project', JSON.stringify({ id: project.id, name: project.name, boqId: null }));
      localStorage.setItem('oe_onboarding_completed', 'true');
      localStorage.setItem('oe-theme', theme);
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }, { token, project, theme });
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    await shoot(page, `theme-${theme}-dashboard`);
    await page.goto(`${BASE}/boq`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await shoot(page, `theme-${theme}-boq`);
    await page.goto(`${BASE}/finance`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await shoot(page, `theme-${theme}-finance`);
    await page.goto(`${BASE}/costs`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await shoot(page, `theme-${theme}-costs`);
    await page.close();
    await ctx.close();
  }

  // Responsive — mobile / tablet
  for (const [bp, vp] of [['mobile', { width: 375, height: 812 }], ['tablet', { width: 768, height: 1024 }]]) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ token, project }) => {
      localStorage.setItem('oe_access_token', token);
      localStorage.setItem('oe_active_project', JSON.stringify({ id: project.id, name: project.name, boqId: null }));
      localStorage.setItem('oe_onboarding_completed', 'true');
    }, { token, project });
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    await shoot(page, `${bp}-dashboard`);
    await page.goto(`${BASE}/projects`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await shoot(page, `${bp}-projects`);
    await page.goto(`${BASE}/boq`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await shoot(page, `${bp}-boq`);
    await page.close();
    await ctx.close();
  }

  // 404 / unauthenticated state
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/this-route-does-not-exist`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await shoot(page, 'error-404');
    await page.close();
    await ctx.close();
  }

  findings.endedAt = new Date().toISOString();
  fs.writeFileSync(path.join(SHOTS, 'findings.json'), JSON.stringify(findings, null, 2));
  console.log(`\nshots: ${findings.shots.length}`);
  await browser.close();
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
