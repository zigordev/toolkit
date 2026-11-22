import { createRequire } from 'node:module';

interface LoaderHooks {
  readonly register: () => void;
}

const installedKey = Symbol.for('zigordev.otel.loader-hooks');

type HooksGlobal = typeof globalThis & { [installedKey]?: true };

export function installLoaderHooks(): void {
  const holder = globalThis as HooksGlobal;
  if (holder[installedKey]) {
    return;
  }
  const fromHere = createRequire(import.meta.url);
  const fromInstrumentation = createRequire(fromHere.resolve('@opentelemetry/instrumentation'));
  const hooks = fromInstrumentation('import-in-the-middle/register-hooks.mjs') as LoaderHooks;
  hooks.register();
  holder[installedKey] = true;
}
