import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { modes, products } from '@zigordev/tokens';
import { defineConfig } from 'vitest/config';
import { prebundled } from './.storybook/main.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const configDir = fileURLToPath(new URL('./.storybook', import.meta.url));
const floor = 90;
const looks = ['template', ...products].flatMap((product) =>
  modes.map((mode) => ({ product, mode }))
);

export default defineConfig({
  root,
  test: {
    projects: looks.map(({ product, mode }) => ({
      extends: true,
      plugins: [storybookTest({ configDir, initialGlobals: { product, mode } })],
      optimizeDeps: { include: prebundled },
      test: {
        name: `ui:stories ${product} ${mode}`,
        browser: {
          enabled: true,
          headless: true,
          provider: playwright(),
          instances: [{ browser: 'chromium' as const }],
        },
      },
    })),
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['**/*.stories.tsx', '**/*.test.{ts,tsx}'],
      reporter: ['text'],
      thresholds: {
        lines: floor,
        functions: floor,
        branches: floor,
        statements: floor,
      },
    },
  },
});
