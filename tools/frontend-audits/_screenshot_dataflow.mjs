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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto('https://openconstructionerp.com/#dataflow', { waitUntil: 'networkidle' });
await page.addStyleTag({ content: FORCE });
await page.evaluate(async () => {
  const step = window.innerHeight * 0.85;
  let y = 0;
  while (y < document.body.scrollHeight) {
    window.scrollTo(0, y);
    await new Promise(r => setTimeout(r, 50));
    y += step;
  }
  document.querySelector('#dataflow')?.scrollIntoView({block:'start'});
  await new Promise(r => setTimeout(r, 300));
});
const sec = await page.locator('#dataflow').first();
await sec.screenshot({ path: join(OUT, 'home.dataflow.png'), timeout: 8000 });
console.log('saved home.dataflow.png');

await ctx.close();
await browser.close();
