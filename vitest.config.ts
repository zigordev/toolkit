import { defineConfig } from 'vitest/config';

const floor = 90;

export default defineConfig({
  test: {
    projects: [
      'packages/*/vitest.config.ts',
      'packages/*/vitest.db.config.ts',
      'template/vitest.config.ts',
      'template/apps/*/vitest.config.ts',
      'template/apps/*/vitest.db.config.ts',
      'template/packages/*/vitest.config.ts',
      'template/packages/*/vitest.db.config.ts',
    ],
    coverage: {
      provider: 'v8',
      include: [
        'packages/*/src/**/*.{ts,tsx}',
        'template/apps/*/src/**/*.{ts,tsx}',
        'template/packages/*/src/**/*.{ts,tsx}',
        'packages/*/*.js',
        'packages/*/shared/.claude/hooks/*.mjs',
      ],
      exclude: ['**/*.test.{js,ts,tsx}', '**/*.d.ts', '**/src/generated/**'],
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
