// Walk every marketing page on the live VPS and save full-page
// screenshots at desktop + mobile widths. Forces reveal-up sections
// visible by injecting CSS so IntersectionObserver-gated content
// shows up in the screenshot.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'shots');
mkdirSync(OUT_DIR, { recursive: true });

const BASE = process.env.BASE_URL || 'https://openconstructionerp.com';
const PAGES = ['/', '/services.html', '/industries.html', '/standards.html', '/maturity.html'];
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile',  width: 390,  height: 844 },
];

const FORCE_VISIBLE_CSS = `
  .reveal-up, .reveal, .pa-section, .fade-in, .animate, [class*="reveal"] {
    opacity: 1 !important;
    transform: none !important;
    visibility: visible !important;
  }
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
  }
`;

async function captureWithScroll(page) {
  await page.addStyleTag({ content: FORCE_VISIBLE_CSS });
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.85;
    let y = 0;
    const max = document.body.scrollHeight;
    while (y < max) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 80));
      y += step;
    }
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 200));
  });
}

const browser = await chromium.launch();
try {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    for (const path of PAGES) {
      const url = `${BASE}${path}`;
      const slug = (path === '/' ? 'home' : path.replace(/^\/|\.html$/g, ''));
      const file = join(OUT_DIR, `${slug}.${vp.name}.png`);
      console.log(`-> ${vp.name} ${url}`);
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        await captureWithScroll(page);
        await page.waitForTimeout(400);
        await page.screenshot({ path: file, fullPage: true });
      } catch (e) {
        console.error(`  FAIL ${url}: ${e.message}`);
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log('done.');
