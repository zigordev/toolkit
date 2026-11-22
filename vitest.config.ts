import { defineConfig } from 'vitest/config';

const floor = 90;

export default defineConfig({
  test: {
    projects: ['packages/*/vitest.config.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.{ts,tsx}', 'packages/*/*.js'],
      exclude: ['**/*.test.{js,ts,tsx}', '**/*.d.ts'],
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
