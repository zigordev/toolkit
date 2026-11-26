import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { type Sandbox, sandbox } from '../../test/sandbox.ts';
import { inlangCli, lineOfKey, textsRule } from './texts.ts';

const here = createRequire(import.meta.url);
const plugin = here.resolve('@inlang/plugin-next-intl');
const packageFolder = fileURLToPath(new URL('../..', import.meta.url));
const settings = 'app/project.inlang/settings.json';

let box: Sandbox | undefined;

afterEach(() => {
  box?.remove();
  box = undefined;
});

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function project(options: {
  readonly en: unknown;
  readonly es: unknown;
  readonly source: string;
  readonly modules?: readonly string[];
}): Sandbox {
  box = sandbox({
    [settings]: json({
      $schema: 'https://inlang.com/schema/project-settings',
      baseLocale: 'en',
      locales: ['en', 'es'],
      modules: options.modules ?? [plugin],
      'plugin.inlang.nextIntl': { pathPattern: './messages/{locale}.json' },
    }),
    'app/messages/en.json': json(options.en),
    'app/messages/es.json': json(options.es),
    'app/src/page.tsx': options.source,
  });
  return box;
}

const source = [
  "import { useTranslations } from 'next-intl';",
  '',
  'export function Page() {',
  "  const t = useTranslations('notes');",
  "  return <h1>{t('title')} {t('count', { count: 2 })} {t('greeting', { name: 'Ada' })}</h1>;",
  '}',
  '',
].join('\n');

const english = {
  notes: {
    title: 'Notes',
    count: '{count, plural, one {# note} other {# notes}}',
    greeting: 'Hello {name}',
  },
};

function run(where: Sandbox, findCli = () => inlangCli(packageFolder)) {
  return textsRule(findCli).run({ root: where.root, files: [settings], env: {} });
}

describe('lineOfKey', () => {
  const text = json({ notes: { title: 'Notes', list: { title: 'All notes' } }, title: 'Top' });

  it('finds a nested key under its parents, not an earlier key of the same name', () => {
    expect(lineOfKey(text, 'notes.list.title')).toBe(5);
    expect(lineOfKey(text, 'notes.title')).toBe(3);
    expect(lineOfKey(text, 'title')).toBe(3);
  });

  it('gives nothing for a key the file lacks', () => {
    expect(lineOfKey(text, 'notes.missing')).toBeUndefined();
  });
});

describe('inlangCli', () => {
  it('finds the command line installed for a folder, and nothing where none is', () => {
    expect(inlangCli(join(packageFolder, 'src'))).toBe(
      join(packageFolder, 'node_modules', '@inlang', 'cli', 'bin', 'run.js')
    );
    expect(inlangCli(tmpdir())).toBeUndefined();
  });
});

describe('the texts rule', () => {
  it('passes a project whose every text is in both languages, filled in and used', () => {
    const where = project({
      en: english,
      es: {
        notes: {
          title: 'Notas',
          count: '{count, plural, one {# nota} other {# notas}}',
          greeting: 'Hola {name}',
        },
      },
      source,
    });

    expect(run(where)).toEqual([]);
  });

  it('names each text that is missing, empty, short of a variable or unused, at its file and line', () => {
    const where = project({
      en: { notes: { ...english.notes, unused: 'Nobody reads this' } },
      es: { notes: { title: '', greeting: 'Hola', unused: 'Nadie lee esto' } },
      source,
    });

    expect(run(where)).toEqual(
      expect.arrayContaining([
        {
          rule: 'texts',
          path: 'app/messages/es.json',
          message: 'the text "notes.count" is missing in es: add it to this file',
        },
        {
          rule: 'texts',
          path: 'app/messages/es.json',
          line: 3,
          message: 'the text "notes.title" is empty in es: fill it in',
        },
        {
          rule: 'texts',
          path: 'app/messages/es.json',
          line: 4,
          message: expect.stringMatching(/notes\.greeting.*\{name\}.*missing-variable/),
        },
        {
          rule: 'texts',
          path: 'app/messages/en.json',
          line: 6,
          message: 'no code uses the text "notes.unused": use it, or remove it from every language',
        },
      ])
    );
    expect(run(where)).toHaveLength(4);
  });

  it('says so when the project names a plugin it cannot load', () => {
    const where = project({ en: english, es: english, source, modules: ['./missing/index.js'] });

    expect(run(where)).toEqual([
      {
        rule: 'texts',
        path: settings,
        message: expect.stringMatching(/^inlang cannot read the project: PluginImportError: /),
      },
    ]);
  });

  it('asks for the command line when the folder does not have it', () => {
    const where = project({ en: english, es: english, source });

    expect(run(where, () => undefined)).toEqual([
      {
        rule: 'texts',
        path: settings,
        message:
          'the inlang command line is not installed in app: add @inlang/cli and the plugin that settings.json names to the devDependencies there',
      },
    ]);
  });

  it('says so when the command line gives no report', () => {
    const where = project({ en: english, es: english, source });
    where.write('broken-cli.js', "process.stderr.write('something broke\\n');\nprocess.exit(2);\n");

    expect(run(where, () => join(where.root, 'broken-cli.js'))).toEqual([
      { rule: 'texts', path: settings, message: 'inlang check did not answer: something broke' },
    ]);
  });

  it('reads only the settings of an inlang project', () => {
    const where = project({ en: english, es: {}, source });

    expect(textsRule().run({ root: where.root, files: ['app/messages/es.json'], env: {} })).toEqual(
      []
    );
  });
});
