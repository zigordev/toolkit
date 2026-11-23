import { readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { Finding, Rule } from '../rule.ts';

interface Comment {
  readonly line: number;
  readonly text: string;
}

interface Marks {
  readonly slashes: boolean;
  readonly blocks: boolean;
  readonly hashes: boolean;
  readonly dashes: boolean;
  readonly templates: boolean;
  readonly regexes: boolean;
}

type Family =
  | 'script'
  | 'style'
  | 'hash'
  | 'sql'
  | 'hcl'
  | 'docker'
  | 'ignore'
  | 'markup'
  | 'markdown';

const none: Marks = {
  slashes: false,
  blocks: false,
  hashes: false,
  dashes: false,
  templates: false,
  regexes: false,
};
const marksOf: Partial<Record<Family, Marks>> = {
  script: { ...none, slashes: true, blocks: true, templates: true, regexes: true },
  style: { ...none, blocks: true },
  hash: { ...none, hashes: true },
  sql: { ...none, dashes: true, blocks: true },
  hcl: { ...none, slashes: true, blocks: true, hashes: true },
};
const byExtension: Record<string, Family> = {
  '.ts': 'script',
  '.tsx': 'script',
  '.mts': 'script',
  '.cts': 'script',
  '.js': 'script',
  '.jsx': 'script',
  '.mjs': 'script',
  '.cjs': 'script',
  '.json': 'script',
  '.jsonc': 'script',
  '.alloy': 'script',
  '.css': 'style',
  '.yml': 'hash',
  '.yaml': 'hash',
  '.toml': 'hash',
  '.sh': 'hash',
  '.bash': 'hash',
  '.zsh': 'hash',
  '.conf': 'hash',
  '.sql': 'sql',
  '.tf': 'hcl',
  '.tofu': 'hcl',
  '.hcl': 'hcl',
  '.tfvars': 'hcl',
  '.html': 'markup',
  '.svg': 'markup',
  '.xml': 'markup',
  '.md': 'markdown',
  '.mdx': 'markdown',
};
const byName: Record<string, Family> = {
  '.gitignore': 'ignore',
  '.dockerignore': 'ignore',
  '.gitattributes': 'ignore',
  '.npmrc': 'hash',
  '.editorconfig': 'hash',
};
const directives: Record<Family, readonly string[]> = {
  script: ['biome-ignore', '@ts-expect-error', 'v8 ignore', '/ <reference '],
  style: ['biome-ignore'],
  hash: ['renovate:', 'zizmor: ignore[', 'shellcheck '],
  sql: [],
  hcl: ['renovate:'],
  docker: ['syntax=', 'escape=', 'check=', 'renovate:'],
  ignore: [],
  markup: [],
  markdown: ['markdownlint-'],
};
const pinnedAction = /uses:\s*["']?[\w./-]+@[0-9a-f]{40}["']?\s+#\s*v?\d+\.\d+\.\d+\S*\s*$/;
const fence = /^ {0,3}(```|~~~)/;
const codeSpan = /`[^`]*`/g;
const beforeRegex = new Set([
  '(',
  ',',
  '=',
  ':',
  '[',
  '!',
  '&',
  '|',
  '?',
  '{',
  ';',
  '*',
  '%',
  '~',
  '^',
]);
const wordsBeforeRegex = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'case',
  'do',
  'else',
  'yield',
  'await',
]);

function familyOf(path: string): Family | undefined {
  const name = basename(path).toLowerCase();
  if (name === 'pnpm-lock.yaml' || name === '.terraform.lock.hcl') {
    return undefined;
  }
  if (name === 'dockerfile' || name.startsWith('dockerfile.') || name.endsWith('.dockerfile')) {
    return 'docker';
  }
  if (name === '.env' || name.startsWith('.env.')) {
    return 'hash';
  }
  return byName[name] ?? byExtension[extname(name)];
}

function isSpace(char: string | undefined): boolean {
  return char === undefined || char === ' ' || char === '\t' || char === '\n' || char === '\r';
}

function skipString(text: string, start: number): number {
  const quote = text[start];
  let index = start + 1;
  while (index < text.length) {
    const char = text[index];
    if (char === '\n') {
      return index;
    }
    if (char === '\\') {
      index += text[index + 1] === '\n' ? 1 : 2;
      continue;
    }
    if (char === quote) {
      return index + 1;
    }
    index += 1;
  }
  return index;
}

function startsRegex(text: string, index: number): boolean {
  let at = index - 1;
  while (at >= 0 && isSpace(text[at])) {
    at -= 1;
  }
  const char = text[at];
  if (char === undefined) {
    return true;
  }
  if (char === '>') {
    return text[at - 1] === '=';
  }
  if (char === '+' || char === '-') {
    return text[at - 1] !== char;
  }
  if (beforeRegex.has(char)) {
    return true;
  }
  const word = /[\w$]+$/.exec(text.slice(Math.max(0, at - 12), at + 1))?.[0];
  return word !== undefined && wordsBeforeRegex.has(word);
}

function skipRegex(text: string, start: number): number | undefined {
  let index = start + 1;
  let inClass = false;
  while (index < text.length) {
    const char = text[index];
    if (char === '\n' || (char === '\\' && text[index + 1] === '\n')) {
      return undefined;
    }
    if (char === '\\') {
      index += 2;
      continue;
    }
    if (char === '[') {
      inClass = true;
    } else if (char === ']') {
      inClass = false;
    } else if (char === '/' && !inClass) {
      index += 1;
      while (/[a-z]/i.test(text[index] ?? '')) {
        index += 1;
      }
      return index;
    }
    index += 1;
  }
  return undefined;
}

function scanCode(text: string, marks: Marks): Comment[] {
  const comments: Comment[] = [];
  const modes: ('code' | 'template')[] = ['code'];
  const depths: number[] = [];
  let line = 1;
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '\n') {
      line += 1;
      index += 1;
      continue;
    }
    if (modes.at(-1) === 'template') {
      if (char === '\\') {
        index += next === '\n' ? 1 : 2;
      } else if (char === '`') {
        modes.pop();
        index += 1;
      } else if (char === '$' && next === '{') {
        modes.push('code');
        depths.push(0);
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }
    if (marks.blocks && char === '/' && next === '*') {
      const close = text.indexOf('*/', index + 2);
      const stop = close === -1 ? text.length : close + 2;
      const body = text.slice(index + 2, close === -1 ? text.length : close);
      comments.push({
        line,
        text:
          body
            .trim()
            .replace(/^\*+\s*/, '')
            .split('\n')[0]
            ?.trim() ?? '',
      });
      line += text.slice(index, stop).split('\n').length - 1;
      index = stop;
      continue;
    }
    const slash = marks.slashes && char === '/' && next === '/' && text[index - 1] !== ':';
    const hash = marks.hashes && char === '#' && isSpace(text[index - 1]);
    const dash = marks.dashes && char === '-' && next === '-' && isSpace(text[index - 1]);
    if (slash || hash || dash) {
      const newline = text.indexOf('\n', index);
      const end = newline === -1 ? text.length : newline;
      comments.push({ line, text: text.slice(index + (hash ? 1 : 2), end).trim() });
      index = end;
      continue;
    }
    if (marks.regexes && char === '/' && startsRegex(text, index)) {
      const end = skipRegex(text, index);
      if (end !== undefined) {
        index = end;
        continue;
      }
    }
    if (char === '"' || char === "'") {
      index = skipString(text, index);
      continue;
    }
    if (marks.templates && char === '`') {
      modes.push('template');
      index += 1;
      continue;
    }
    if (modes.length > 1) {
      const depth = depths.at(-1) ?? 0;
      if (char === '{') {
        depths[depths.length - 1] = depth + 1;
      } else if (char === '}' && depth === 0) {
        depths.pop();
        modes.pop();
      } else if (char === '}') {
        depths[depths.length - 1] = depth - 1;
      }
    }
    index += 1;
  }
  return comments;
}

function scanLineStarts(text: string): Comment[] {
  return text.split('\n').flatMap((raw, index) => {
    const trimmed = raw.trimStart();
    return trimmed.startsWith('#') ? [{ line: index + 1, text: trimmed.slice(1).trim() }] : [];
  });
}

function scanMarkup(text: string, markdown: boolean): Comment[] {
  const comments: Comment[] = [];
  let fenced = false;
  let open = false;
  text.split('\n').forEach((raw, index) => {
    if (markdown && !open && fence.test(raw)) {
      fenced = !fenced;
      return;
    }
    if (fenced) {
      return;
    }
    let rest = markdown ? raw.replace(codeSpan, (span) => ' '.repeat(span.length)) : raw;
    while (rest !== '') {
      if (open) {
        const close = rest.indexOf('-->');
        if (close === -1) {
          return;
        }
        open = false;
        rest = rest.slice(close + 3);
        continue;
      }
      const start = rest.indexOf('<!--');
      if (start === -1) {
        return;
      }
      const close = rest.indexOf('-->', start + 4);
      comments.push({
        line: index + 1,
        text: rest.slice(start + 4, close === -1 ? undefined : close).trim(),
      });
      if (close === -1) {
        open = true;
        return;
      }
      rest = rest.slice(close + 3);
    }
  });
  return comments;
}

function scan(family: Family, text: string): Comment[] {
  const marks = marksOf[family];
  if (marks !== undefined) {
    return scanCode(text, marks);
  }
  return family === 'docker' || family === 'ignore'
    ? scanLineStarts(text)
    : scanMarkup(text, family === 'markdown');
}

function allowed(family: Family, comment: Comment, lines: readonly string[]): boolean {
  const source = lines[comment.line - 1] ?? '';
  if (comment.line === 1 && source.startsWith('#!')) {
    return true;
  }
  if (family === 'hash' && pinnedAction.test(source)) {
    return true;
  }
  return directives[family].some((directive) => comment.text.startsWith(directive));
}

function check(root: string, file: string): Finding[] {
  const family = familyOf(file);
  if (family === undefined) {
    return [];
  }
  const text = readFileSync(join(root, file), 'utf8');
  const lines = text.split('\n');
  return scan(family, text)
    .filter((comment) => !allowed(family, comment, lines))
    .map((comment) => ({
      rule: 'comments',
      path: file,
      line: comment.line,
      message: `a comment: "${comment.text.slice(0, 60)}"`,
    }));
}

export const comments: Rule = {
  name: 'comments',
  summary: 'no file holds a comment',
  run({ root, files }) {
    return files.flatMap((file) => check(root, file));
  },
};
