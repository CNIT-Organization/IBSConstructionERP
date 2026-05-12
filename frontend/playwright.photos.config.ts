/**
 * Local Playwright config for the Photos tab spec — points at the
 * already-running dev server on :5180 instead of trying to start a
 * second copy on the default :5173 (which strictPort would block).
 *
 * Run: npx playwright test --config=playwright.photos.config.ts
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'photos-tab.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'line',
  timeout: 180_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5181',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    ignoreHTTPSErrors: true,
    navigationTimeout: 90_000,
    actionTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
