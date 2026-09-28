// Focused element screenshots — verify the ask-block layout fix and
// the CTA button border-radius change.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'shots');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const FORCE = `
  .reveal-up,.reveal,[class*="reveal"]{opacity:1!important;transform:none!important;visibility:visible!important;}
  *,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;}
`;

async function loadAndScroll(url) {
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

// ── 1. ask-block layout
await loadAndScroll('https://openconstructionerp.com/industries.html');
const ask = await page.locator('.ask-block').first();
await ask.scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
await ask.screenshot({ path: join(OUT, 'industries.ask-block.png') });
console.log('saved industries.ask-block.png');

// ── 2. CTA button on industries page
const cta = await page.locator('.cta-band-actions').first();
await cta.scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
await cta.screenshot({ path: join(OUT, 'industries.cta-buttons.png') });
console.log('saved industries.cta-buttons.png');

// ── 3. CTA on maturity (the start-assessment button)
await loadAndScroll('https://openconstructionerp.com/maturity.html');
const startBtn = await page.locator('button.btn-primary, a.btn-primary').first();
await startBtn.scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
await startBtn.screenshot({ path: join(OUT, 'maturity.start-button.png') });
console.log('saved maturity.start-button.png');

await ctx.close();
await browser.close();
