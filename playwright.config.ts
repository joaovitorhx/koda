import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: process.env.E2E_REAL === 'true' ? '**/integration.spec.ts' : '**/flow.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8093',
    viewport: { width: 390, height: 844 },
    browserName: 'chromium',
    channel: 'chrome',
    screenshot: 'only-on-failure',
  },
});
