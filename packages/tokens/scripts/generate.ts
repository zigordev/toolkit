import { mkdir, writeFile } from 'node:fs/promises';
import { generatedFiles, serialize } from '../src/palette/generate.ts';

const directory = new URL('../src/tokens/color/', import.meta.url);

for (const [name, document] of Object.entries(generatedFiles())) {
  const file = new URL(name, directory);
  await mkdir(new URL('.', file), { recursive: true });
  await writeFile(file, serialize(document));
}
