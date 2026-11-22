import { afterEach, describe, expect, it, vi } from 'vitest';

const node = vi.hoisted(() => {
  const instrumentation = '/deps/@opentelemetry/instrumentation/dist/index.cjs';
  const register = vi.fn();
  const requireFromInstrumentation = vi.fn(() => ({ register }));
  const resolve = vi.fn(() => instrumentation);
  const createRequire = vi.fn((from: string) =>
    from === instrumentation ? requireFromInstrumentation : { resolve }
  );
  return { instrumentation, register, requireFromInstrumentation, resolve, createRequire };
});

vi.mock('node:module', () => ({ createRequire: node.createRequire }));

const { installLoaderHooks } = await import('./loader-hooks.ts');

afterEach(() => {
  Reflect.deleteProperty(globalThis, Symbol.for('zigordev.otel.loader-hooks'));
  vi.clearAllMocks();
});

describe('installLoaderHooks', () => {
  it('registers the hooks of the copy that the instrumentation itself uses', () => {
    installLoaderHooks();

    expect(node.resolve).toHaveBeenCalledWith('@opentelemetry/instrumentation');
    expect(node.createRequire).toHaveBeenLastCalledWith(node.instrumentation);
    expect(node.requireFromInstrumentation).toHaveBeenCalledWith(
      'import-in-the-middle/register-hooks.mjs'
    );
    expect(node.register).toHaveBeenCalledTimes(1);
  });

  it('registers them once per process', () => {
    installLoaderHooks();
    installLoaderHooks();

    expect(node.register).toHaveBeenCalledTimes(1);
  });
});
