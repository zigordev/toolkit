import { writeFileSync } from 'node:fs';
import { themeModule, tokensCss } from './theme.ts';

const generated = new URL('../src/generated/', import.meta.url);

export function messagesModule(messages: unknown): string {
  return [
    "import type { StandardTemplates } from '../fill.ts';",
    '',
    `export const messages: StandardTemplates = ${JSON.stringify(messages, null, 2)};`,
    '',
  ].join('\n');
}

if (import.meta.main) {
  writeFileSync(new URL('theme.ts', generated), themeModule(tokensCss()));
  const { renderStandardMessages } = await import('../src/build.ts');
  writeFileSync(new URL('messages.ts', generated), messagesModule(await renderStandardMessages()));
}
