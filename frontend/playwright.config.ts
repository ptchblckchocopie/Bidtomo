import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'on',
    video: 'off',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', viewport: { width: 1400, height: 900 } } },
  ],
});
