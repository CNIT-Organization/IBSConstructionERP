// Targeted audit screenshots — sections most likely to have layout
// problems. Each capture covers a specific block we recently touched
// or that has complex CSS (grid + animation).

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'shots', 'audit');
mkdirSync(OUT, { recursive: true });

const FORCE = `
  .reveal-up,.reveal,[class*="reveal"]{opacity:1!important;transform:none!important;visibility:visible!important;}
  *,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;}
`;

const browser = await chromium.launch();

async function loadAndScroll(page, url) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: FORCE });
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.85;
    let y = 0;
    while (y < document.body.scrollHeight) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 50));
      y += step;
    }
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 200));
  });
}

async function shot(page, selector, name) {
  try {
    const el = await page.locator(selector).first();
    if (!(await el.count())) {
      console.log(`SKIP ${name} — not found`);
      return;
    }
    // Force the element visible even if it is normally JS-gated
    // (results panels, modal bodies, etc.).
    await page.evaluate((sel) => {
      const e = document.querySelector(sel);
      if (e) {
        e.style.display = 'block';
        e.style.visibility = 'visible';
        e.style.opacity = '1';
        e.scrollIntoView({ block: 'start' });
      }
    }, selector);
    await page.waitForTimeout(200);
    await el.screenshot({ path: join(OUT, `${name}.png`), timeout: 8000 });
    console.log(`saved ${name}.png`);
  } catch (e) {
    console.log(`SKIP ${name} — ${e.message.split('\n')[0]}`);
  }
}

// Desktop pass
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Home — practice-atlas card stack at the bottom
  await loadAndScroll(page, 'https://openconstructionerp.com/');
  await shot(page, '.pa-section', 'home.practice-atlas');

  // Services — timeline block + qchecklist + repo banner
  await loadAndScroll(page, 'https://openconstructionerp.com/services.html');
  await shot(page, '.timeline', 'services.timeline');
  await shot(page, '.qchecklist', 'services.qchecklist');
  await shot(page, '.repo-banner', 'services.repo-banner');

  // Industries — fit-table + practice-fit + ask-block in one sector
  await loadAndScroll(page, 'https://openconstructionerp.com/industries.html');
  await shot(page, '#commercial', 'industries.commercial-sector');
  await shot(page, '#heavy', 'industries.heavy-sector');

  // Standards — code examples grid + decision table
  await loadAndScroll(page, 'https://openconstructionerp.com/standards.html');
  await shot(page, '#examples', 'standards.examples');
  await shot(page, '#decision', 'standards.decision');

  // Maturity — band ladder + bench-note (recently rewritten)
  await loadAndScroll(page, 'https://openconstructionerp.com/maturity.html');
  await shot(page, '.bench-note', 'maturity.bench-note');

  await ctx.close();
}

// Mobile pass for the most layout-fragile blocks
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  await loadAndScroll(page, 'https://openconstructionerp.com/industries.html');
  await shot(page, '.ask-block', 'mobile.industries.ask-block');
  await shot(page, '.cta-band', 'mobile.industries.cta-band');

  await loadAndScroll(page, 'https://openconstructionerp.com/services.html');
  await shot(page, '.timeline', 'mobile.services.timeline');
  await shot(page, '.qchecklist', 'mobile.services.qchecklist');

  await loadAndScroll(page, 'https://openconstructionerp.com/standards.html');
  await shot(page, '#examples', 'mobile.standards.examples');

  await ctx.close();
}

await browser.close();
console.log('done.');
