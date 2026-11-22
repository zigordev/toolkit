import { afterEach, describe, expect, it } from 'vitest';
import { type Sandbox, sandbox } from '../../test/sandbox.ts';
import { comments } from './comments.ts';

const commit = '3d3c42e5aac5ba805825da76410c181273ba90b1';
let box: Sandbox;

function hole(code: string): string {
  return ['$', '{', code, '}'].join('');
}

function run(file: string, lines: readonly string[]): string[] {
  box = sandbox({ [file]: lines.join('\n') });
  return comments
    .run({ root: box.root, files: [file], env: {} })
    .map((finding) => `${finding.line} ${finding.message}`);
}

afterEach(() => {
  box.remove();
});

describe('the comments rule in TypeScript and JavaScript', () => {
  it('reports line comments, block comments and their lines', () => {
    expect(
      run('a.ts', [
        'const a = 1; // trailing',
        '/** documented',
        ' * more',
        ' */',
        'const b = 2;',
        '/* block */ const c = 3;',
        '// last',
      ])
    ).toEqual([
      '1 a comment: "trailing"',
      '2 a comment: "documented"',
      '6 a comment: "block"',
      '7 a comment: "last"',
    ]);
  });

  it('leaves strings, addresses and template text alone', () => {
    expect(
      run('a.tsx', [
        'const url = "https://example.com//path";',
        "const text = 'it\\'s // fine' + \"/* fine */\";",
        'const page = <a>http://example.com</a>;',
        `const words = \`one // two ${hole('url')} /* three */\`;`,
        `const nested = \`${hole('{ a: 1 }.a')} // four\`;`,
      ])
    ).toEqual([]);
  });

  it('reports a comment inside a template expression', () => {
    expect(run('a.js', [`const words = \`one ${hole('two /* inner */')} three\`;`])).toEqual([
      '1 a comment: "inner"',
    ]);
  });

  it('keeps counting lines through templates and broken strings', () => {
    expect(
      run('a.mjs', [
        'const many = `first',
        '// inside the template \\',
        'still inside \\` here`;',
        "const open = 'never closed",
        "const long = 'one \\",
        "two';",
        '// real',
      ])
    ).toEqual(['7 a comment: "real"']);
  });

  it('reports a block comment that never closes', () => {
    expect(run('a.cjs', ['const a = 1;', '/* open', 'const b = 2;'])).toEqual([
      '2 a comment: "open"',
    ]);
  });

  it('allows the lines a tool needs', () => {
    expect(
      run('a.mts', [
        '/// <reference types="node" />',
        '// biome-ignore lint/suspicious/noConsole: the command prints',
        '// @ts-expect-error the library types are wrong',
        '/* v8 ignore next */',
      ])
    ).toEqual([]);
  });

  it('reads JSON files too', () => {
    expect(run('a.json', ['{', '  "url": "https://example.com", // note', '}'])).toEqual([
      '2 a comment: "note"',
    ]);
  });

  it('clips a long comment', () => {
    expect(run('a.cts', [`// ${'x'.repeat(80)}`])).toEqual([`1 a comment: "${'x'.repeat(60)}"`]);
  });
});

describe('the comments rule in other files', () => {
  it('reports CSS block comments only', () => {
    expect(
      run('a.css', [
        'a { color: red; } /* note */',
        'b { background: url(//cdn.example.com/x.png); }',
      ])
    ).toEqual(['1 a comment: "note"']);
  });

  it('reports hash comments in YAML and leaves values alone', () => {
    expect(
      run('a.yml', [
        '# full line',
        'key: value # trailing',
        'url: "http://example.com #fragment"',
        "colour: '#fff'",
        'anchor: a#b',
      ])
    ).toEqual(['1 a comment: "full line"', '2 a comment: "trailing"']);
  });

  it('allows the version beside a pinned action and tool directives in YAML', () => {
    expect(
      run('.github/workflows/ci.yaml', [
        `      - uses: actions/checkout@${commit} # v7.0.1`,
        '        # renovate: datasource=github-releases',
        '        # zizmor: ignore[artipacked]',
        '      - uses: actions/checkout@v7 # v7',
      ])
    ).toEqual(['4 a comment: "v7"']);
  });

  it('allows the first line of a script to name its interpreter', () => {
    expect(
      run('a.sh', [
        '#!/usr/bin/env bash',
        '# note',
        `echo "${hole('1#x')}" # shellcheck disable=SC2086`,
      ])
    ).toEqual(['2 a comment: "note"']);
  });

  it('reads TOML and env files', () => {
    expect(run('mise.toml', ['[tools] # note'])).toEqual(['1 a comment: "note"']);
    box.remove();
    expect(run('.env.example', ['# names only', 'NAME='])).toEqual(['1 a comment: "names only"']);
    box.remove();
    expect(run('.npmrc', ['# note'])).toEqual(['1 a comment: "note"']);
  });

  it('reports SQL comments', () => {
    expect(run('a.sql', ["select '--not', a--b from t; -- note", '/* block */'])).toEqual([
      '1 a comment: "note"',
      '2 a comment: "block"',
    ]);
  });

  it('reports every comment style of OpenTofu files', () => {
    expect(run('main.tf', ['# hash', '// slash', '/* block */', 'name = "#not"'])).toEqual([
      '1 a comment: "hash"',
      '2 a comment: "slash"',
      '3 a comment: "block"',
    ]);
  });

  it('reports Dockerfile comments and allows the parser directives', () => {
    const lines = ['# syntax=docker/dockerfile:1', '# note', 'RUN echo "# not a comment"'];
    expect(run('Dockerfile', lines)).toEqual(['2 a comment: "note"']);
    box.remove();
    expect(run('api.Dockerfile', lines)).toEqual(['2 a comment: "note"']);
    box.remove();
    expect(run('Dockerfile.dev', lines)).toEqual(['2 a comment: "note"']);
  });

  it('reports comment lines in ignore files', () => {
    expect(run('.gitignore', ['node_modules/', '  # note', 'file#name'])).toEqual([
      '2 a comment: "note"',
    ]);
  });

  it('reports HTML comments, also across lines', () => {
    expect(
      run('a.html', [
        '<p>one</p><!-- first --><p>two</p><!-- second',
        'still second --><!-- third -->',
      ])
    ).toEqual(['1 a comment: "first"', '1 a comment: "second"', '2 a comment: "third"']);
  });

  it('reports hidden notes in Markdown and leaves code alone', () => {
    expect(
      run('a.md', [
        '# Title',
        '<!-- hidden -->',
        'Write `<!-- like this -->` to hide text.',
        '```html',
        '<!-- in a code block -->',
        '```',
        '<!-- markdownlint-disable MD013 -->',
        '<!-- open',
        '``` not a fence here',
        '-->',
      ])
    ).toEqual(['2 a comment: "hidden"', '8 a comment: "open"']);
  });

  it('skips the lockfile and files it does not know', () => {
    expect(run('pnpm-lock.yaml', ['# note'])).toEqual([]);
    box.remove();
    expect(run('image.png', ['# note'])).toEqual([]);
  });
});
