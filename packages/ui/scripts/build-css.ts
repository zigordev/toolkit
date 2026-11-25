import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleAsync } from 'lightningcss';
import { targets } from './targets.ts';

export const entry = fileURLToPath(new URL('../src/styles/index.css', import.meta.url));

export async function bundleCss(): Promise<string> {
  const { code } = await bundleAsync({
    filename: entry,
    minify: true,
    targets,
    resolver: {
      read: (file) => readFile(file, 'utf8'),
      resolve: (specifier, from) =>
        specifier.startsWith('.')
          ? resolve(dirname(from), specifier)
          : createRequire(from).resolve(specifier),
    },
  });
  return new TextDecoder().decode(code);
}

if (import.meta.main) {
  const output = new URL('../dist/', import.meta.url);
  await mkdir(output, { recursive: true });
  await writeFile(new URL('ui.css', output), await bundleCss());
}
