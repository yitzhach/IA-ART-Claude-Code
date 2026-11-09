import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests for the built site. `npm test` builds, serves dist/ and runs every spec on a
 * desktop and a phone viewport. First time on a new machine: `npx playwright install chromium`.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4322', trace: 'off', reducedMotion: 'reduce' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
  webServer: {
    command: 'npx astro preview --host 127.0.0.1 --port 4322',
    url: 'http://127.0.0.1:4322/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
