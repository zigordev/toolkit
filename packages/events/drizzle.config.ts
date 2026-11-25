import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/tables.ts',
  out: './test/drizzle',
  casing: 'snake_case',
  breakpoints: false,
});
