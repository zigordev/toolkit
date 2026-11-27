import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { nativeModule } from '../src/native/build.ts';

const css = await readFile(new URL('../dist/tokens.css', import.meta.url), 'utf8');
const directory = new URL('../src/generated/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('native.ts', directory), nativeModule(css));
