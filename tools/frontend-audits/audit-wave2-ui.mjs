// Wave 2 (UI) — drive real user flows through Playwright, capture
// console errors / network 4xx-5xx / page errors per flow.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:8090';
const API = `${BASE}/api/v1`;
const SHOTS = path.resolve('qa-shots/audit-wave-2-ui');
fs.mkdirSync(SHOTS, { recursive: true });

const findings = { startedAt: new Date().toISOString(), flows: [] };

async function login() {
  const r = await fetch(`${API}/users/auth/login/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'v19-e2e@openestimate.com', password: 'OpenEstimate2024!' }),
  });
  return (await r.json()).access_token;
}

async function listProjects(token) {
  const r = await fetch(`${API}/projects/`, { headers: { Authorization: `Bearer ${token}` } });
  return r.ok ? r.json() : [];
}

async function flow(page, name, fn) {
  const flow = { name, errors: [], networkErrors: [], pageErrors: [], slow: [], screenshot: null };
  const consoleHandler = (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('favicon')) {
      flow.errors.push(msg.text().slice(0, 240));
    }
  };
  const responseHandler = (r) => {
    const s = r.status();
    if (s >= 400 && !r.url().includes('favicon')) {
      flow.networkErrors.push(`${s} ${r.url().replace(BASE, '')}`);
    }
    const timing = r.timing?.();
    if (timing && timing.responseEnd > 5000) {
      flow.slow.push(`${Math.round(timing.responseEnd)}ms ${r.url().replace(BASE, '')}`);
    }
  };
  const errorHandler = (e) => flow.pageErrors.push(String(e?.message || e).slice(0, 240));
  page.on('console', consoleHandler);
  page.on('response', responseHandler);
  page.on('pageerror', errorHandler);
  console.log(`\n── ${name} ──`);
  try {
    await fn(page, flow);
  } catch (e) {
    flow.pageErrors.push(`flow threw: ${e?.message || e}`);
  }
  page.off('console', consoleHandler);
  page.off('response', responseHandler);
  page.off('pageerror', errorHandler);
  flow.screenshot = path.join(SHOTS, `${name}.png`);
  try { await page.screenshot({ path: flow.screenshot, fullPage: false }); } catch {}
  findings.flows.push(flow);
  console.log(`  errors=${flow.errors.length} pageErr=${flow.pageErrors.length} 4xx5xx=${flow.networkErrors.length} slow=${flow.slow.length}`);
  if (flow.networkErrors.length) for (const e of flow.networkErrors) console.log(`    NET: ${e}`);
  if (flow.errors.length) for (const e of flow.errors) console.log(`    CON: ${e}`);
  if (flow.pageErrors.length) for (const e of flow.pageErrors) console.log(`    PG : ${e}`);
}

(async () => {
  const token = await login();
  const projects = await listProjects(token);
  const project = projects[0];
  if (!project) { console.log('no project'); return; }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ token, project }) => {
    localStorage.setItem('oe_access_token', token);
    localStorage.setItem('oe_active_project', JSON.stringify({ id: project.id, name: project.name, boqId: project.default_boq_id || null }));
    localStorage.setItem('oe_onboarding_completed', 'true');
  }, { token, project });

  await flow(page, '01-dashboard-load', async (p) => {
    await p.goto(`${BASE}/`);
    await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  });

  await flow(page, '02-project-card-click', async (p) => {
    await p.goto(`${BASE}/projects`);
    await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    const card = await p.locator('a[href^="/projects/"], [data-testid="project-card"]').first();
    if (await card.count()) {
      await card.click({ trial: true }).catch(() => {});
    }
  });

  await flow(page, '03-boq-load', async (p) => {
    await p.goto(`${BASE}/boq`);
    await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  });

  await flow(page, '04-cost-search', async (p) => {
    await p.goto(`${BASE}/costs`);
    await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    const input = p.locator('input[type="search"], input[placeholder*="Search" i]').first();
    if (await input.count()) {
      await input.fill('concrete');
      await p.waitForTimeout(2500);
    }
  });

  await flow(page, '05-takeoff-tab-switch', async (p) => {
    await p.goto(`${BASE}/takeoff?tab=measurements`);
    await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    const aiTab = p.locator('button:has-text("Documents & AI"), button:has-text("Documents and AI")');
    if (await aiTab.count()) await aiTab.first().click().catch(() => {});
    await p.waitForTimeout(1200);
  });

  await flow(page, '06-bim-viewer', async (p) => {
    await p.goto(`${BASE}/bim`);
    await p.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  });

  await flow(page, '07-data-explorer', async (p) => {
    await p.goto(`${BASE}/data-explorer`);
    await p.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  });

  await flow(page, '08-bim-rules', async (p) => {
    await p.goto(`${BASE}/bim/rules`);
    await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  });

  await flow(page, '09-validation', async (p) => {
    await p.goto(`${BASE}/validation`);
    await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  });

  await flow(page, '10-rfi', async (p) => {
    await p.goto(`${BASE}/rfi`);
    await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  });

  await flow(page, '11-meetings', async (p) => {
    await p.goto(`${BASE}/meetings`);
    await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  });

  await flow(page, '12-tasks', async (p) => {
    await p.goto(`${BASE}/tasks`);
    await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  });

  await flow(page, '13-schedule', async (p) => {
    await p.goto(`${BASE}/schedule`);
    await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  });

  await flow(page, '14-finance', async (p) => {
    await p.goto(`${BASE}/finance`);
    await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  });

  await flow(page, '15-reports', async (p) => {
    await p.goto(`${BASE}/reports`);
    await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  });

  await flow(page, '16-cde', async (p) => {
    await p.goto(`${BASE}/cde`);
    await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  });

  await flow(page, '17-photos', async (p) => {
    await p.goto(`${BASE}/photos`);
    await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  });

  await flow(page, '18-tendering', async (p) => {
    await p.goto(`${BASE}/tendering`);
    await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  });

  await flow(page, '19-procurement', async (p) => {
    await p.goto(`${BASE}/procurement`);
    await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  });

  await flow(page, '20-changeorders', async (p) => {
    await p.goto(`${BASE}/changeorders`);
    await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  });

  findings.endedAt = new Date().toISOString();
  fs.writeFileSync(path.join(SHOTS, 'findings.json'), JSON.stringify(findings, null, 2));
  const total = findings.flows.reduce((s, f) => s + f.errors.length + f.pageErrors.length + f.networkErrors.length, 0);
  console.log(`\nTOTAL ISSUES: ${total} across ${findings.flows.length} flows`);
  await browser.close();
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
