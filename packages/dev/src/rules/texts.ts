import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import type { Finding, Rule } from '../rule.ts';

const settingsFile = /(^|\/)project\.inlang\/settings\.json$/;
const patience = 120_000;

export type FindCli = (folder: string) => string | undefined;

export interface TextDiagnostic {
  readonly checkId: string;
  readonly bundleId?: string;
  readonly locale?: string;
  readonly message: string;
}

interface ProjectError {
  readonly name?: string;
  readonly message?: string;
}

interface Report {
  readonly errors?: readonly ProjectError[];
  readonly diagnostics?: readonly TextDiagnostic[];
}

interface Project {
  readonly root: string;
  readonly settings: string;
  readonly folder: string;
  readonly baseLocale: string | undefined;
  readonly pathPattern: string | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function inlangCli(folder: string): string | undefined {
  let current = resolve(folder);
  for (;;) {
    const candidate = join(current, 'node_modules', '@inlang', 'cli', 'bin', 'run.js');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

export function lineOfKey(text: string, key: string): number | undefined {
  const lines = text.split('\n');
  let from = 0;
  let found = -1;
  for (const segment of key.split('.')) {
    const name = `${JSON.stringify(segment)}:`;
    found = lines.findIndex((line, index) => index >= from && line.includes(name));
    if (found === -1) {
      return undefined;
    }
    from = found + 1;
  }
  return found + 1;
}

function projectOf(root: string, settings: string): Project {
  const folder = posix.dirname(posix.dirname(settings));
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(join(root, settings), 'utf8'));
  } catch {
    parsed = undefined;
  }
  const plugin = isRecord(parsed) ? parsed['plugin.inlang.nextIntl'] : undefined;
  const pattern = isRecord(plugin) ? plugin.pathPattern : undefined;
  const base = isRecord(parsed) ? parsed.baseLocale : undefined;
  return {
    root,
    settings,
    folder,
    baseLocale: typeof base === 'string' ? base : undefined,
    pathPattern: typeof pattern === 'string' ? pattern : undefined,
  };
}

function messagesFile(project: Project, locale: string | undefined): string | undefined {
  if (project.pathPattern === undefined || locale === undefined) {
    return undefined;
  }
  const relative = project.pathPattern.replaceAll(/\{(?:locale|languageTag)\}/g, locale);
  return posix.normalize(posix.join(project.folder, relative));
}

function messageOf(diagnostic: TextDiagnostic, locale: string | undefined): string {
  const text = `the text "${diagnostic.bundleId ?? ''}"`;
  switch (diagnostic.checkId) {
    case 'missing-translation':
      return `${text} is missing in ${locale}: add it to this file`;
    case 'empty-translation':
      return `${text} is empty in ${locale}: fill it in`;
    case 'unused-message':
      return `no code uses ${text}: use it, or remove it from every language`;
    default:
      return `${diagnostic.message} (inlang's ${diagnostic.checkId})`;
  }
}

function findingOf(project: Project, diagnostic: TextDiagnostic): Finding {
  const locale = diagnostic.locale ?? project.baseLocale;
  const file = messagesFile(project, locale);
  const path = file !== undefined && existsSync(join(project.root, file)) ? file : project.settings;
  const line =
    path === project.settings ||
    diagnostic.checkId === 'missing-translation' ||
    diagnostic.bundleId === undefined
      ? undefined
      : lineOfKey(readFileSync(join(project.root, path), 'utf8'), diagnostic.bundleId);
  return {
    rule: 'texts',
    path,
    ...(line === undefined ? {} : { line }),
    message: messageOf(diagnostic, locale),
  };
}

function problem(project: Project, message: string): Finding {
  return { rule: 'texts', path: project.settings, message };
}

function reportOf(output: string): Report | undefined {
  try {
    const parsed: unknown = JSON.parse(output);
    return isRecord(parsed) ? (parsed as Report) : undefined;
  } catch {
    return undefined;
  }
}

function lineIn(text: string, pick: 'first' | 'last'): string {
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  return (pick === 'first' ? lines[0] : lines.at(-1))?.trim() ?? 'it printed nothing';
}

function checkProject(project: Project, findCli: FindCli): Finding[] {
  const folder = join(project.root, project.folder);
  const cli = findCli(folder);
  if (cli === undefined) {
    return [
      problem(
        project,
        `the inlang command line is not installed in ${project.folder}: add @inlang/cli and the plugin that settings.json names to the devDependencies there`
      ),
    ];
  }
  const source = existsSync(join(folder, 'src')) ? join(folder, 'src') : folder;
  const run = spawnSync(
    process.execPath,
    [
      cli,
      'check',
      '--project',
      join(project.root, posix.dirname(project.settings)),
      '--source',
      source,
      '--format',
      'json',
    ],
    {
      cwd: folder,
      encoding: 'utf8',
      timeout: patience,
      env: { ...process.env, NO_COLOR: '1' },
    }
  );
  const report = run.status === 0 || run.status === 1 ? reportOf(run.stdout) : undefined;
  if (report === undefined) {
    return [
      problem(
        project,
        `inlang check did not answer: ${lineIn(`${run.stdout ?? ''}\n${run.stderr ?? ''}`, 'last')}`
      ),
    ];
  }
  return [
    ...(report.errors ?? []).map((error) =>
      problem(
        project,
        `inlang cannot read the project: ${error.name ?? 'Error'}: ${lineIn(error.message ?? '', 'first')}`
      )
    ),
    ...(report.diagnostics ?? []).map((diagnostic) => findingOf(project, diagnostic)),
  ];
}

export function textsRule(findCli: FindCli = inlangCli): Rule {
  return {
    name: 'texts',
    summary:
      'every text of an inlang project exists, filled in, in every language, with the same variables, and code uses it',
    run({ root, files }) {
      return files
        .filter((path) => settingsFile.test(path))
        .flatMap((settings) => checkProject(projectOf(root, settings), findCli));
    },
  };
}

export const texts = textsRule();
