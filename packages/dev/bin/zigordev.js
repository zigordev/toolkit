#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
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
  run: (command, args, cwd) => {
    const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
    return {
      status: result.status ?? 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? result.error?.message ?? '',
    };
  },
  write: (text) => {
    process.stdout.write(text);
  },
});
