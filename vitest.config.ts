import { defineConfig } from 'vitest/config';

const floor = 90;

export default defineConfig({
  test: {
    projects: ['packages/*/vitest.config.ts', 'template/apps/*/vitest.config.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'packages/*/src/**/*.{ts,tsx}',
        'template/apps/*/src/**/*.{ts,tsx}',
        'packages/*/*.js',
        'packages/*/shared/.claude/hooks/*.mjs',
      ],
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
