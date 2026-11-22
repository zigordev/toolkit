import { context, ROOT_CONTEXT, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { type RPCMetadata, RPCType, setRPCMetadata } from '@opentelemetry/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nameRoute } from './index.ts';

beforeAll(() => {
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
});

afterAll(() => {
  context.disable();
});

function request(): RPCMetadata {
  const span = trace.wrapSpanContext({
    traceId: 'a'.repeat(32),
    spanId: 'b'.repeat(16),
    traceFlags: 1,
  });
  return { type: RPCType.HTTP, span };
}

describe('nameRoute', () => {
  it('gives the request in progress its route pattern', () => {
    const metadata = request();

    context.with(setRPCMetadata(ROOT_CONTEXT, metadata), () => {
      nameRoute('/api/v1/pools/:poolId');
    });

    expect(metadata.route).toBe('/api/v1/pools/:poolId');
  });

  it('does nothing outside a request', () => {
    expect(() => nameRoute('/api/v1/pools/:poolId')).not.toThrow();
  });
});
