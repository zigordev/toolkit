import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/drizzle.ts',
  out: './test/drizzle',
  casing: 'snake_case',
  breakpoints: false,
});
