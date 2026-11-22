#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = new URL('../src/cli.ts', import.meta.url);
const entry = existsSync(fileURLToPath(source))
  ? source
  : new URL('../dist/cli.js', import.meta.url);
const { main } = await import(entry.href);

process.exitCode = main(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  shared: fileURLToPath(new URL('../shared/', import.meta.url)),
  write: (text) => {
    process.stdout.write(text);
  },
});
