import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Finding, Rule } from '../rule.ts';

const always = [
  'build',
  'check',
  'check:quick',
  'format',
  'format:check',
  'lint',
  'test',
  'typecheck',
];
const withLocalStack = ['dev', 'local:down', 'local:reset', 'local:up'];

function finding(message: string): Finding {
  return { rule: 'scripts', path: 'package.json', message };
}

function readScripts(path: string): Record<string, unknown> | undefined {
  try {
    const manifest: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (typeof manifest !== 'object' || manifest === null) {
      return undefined;
    }
    const scripts: unknown = Reflect.get(manifest, 'scripts');
    return typeof scripts === 'object' && scripts !== null ? { ...scripts } : {};
  } catch {
    return undefined;
  }
}

export const scripts: Rule = {
  name: 'scripts',
  summary: 'package.json has the standard scripts',
  run({ root }) {
    const path = join(root, 'package.json');
    if (!existsSync(path)) {
      return [finding('the file is missing')];
    }
    const present = readScripts(path);
    if (present === undefined) {
      return [finding('the file is not a JSON object')];
    }
    const required = existsSync(join(root, 'compose.yaml'))
      ? [...always, ...withLocalStack]
      : always;
    return required
      .filter((name) => typeof present[name] !== 'string')
      .map((name) => finding(`the script "${name}" is missing`));
  },
};
