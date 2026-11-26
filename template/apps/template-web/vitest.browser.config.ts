import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const floor = 90;

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  test: {
    name: 'template-web:browser',
    include: ['src/**/*.client.test.tsx'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
      screenshotFailures: false,
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.client.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}'],
      reporter: ['text'],
      thresholds: { lines: floor, functions: floor, branches: floor, statements: floor },
    },
  },
});
