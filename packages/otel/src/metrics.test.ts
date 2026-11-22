import { MeterProvider, MetricReader } from '@opentelemetry/sdk-metrics';
import { describe, expect, it } from 'vitest';
import { createCounterAtZero } from './index.ts';

class TestReader extends MetricReader {
  protected override async onShutdown(): Promise<void> {}
  protected override async onForceFlush(): Promise<void> {}
}

async function points(reader: TestReader, name: string) {
  const { resourceMetrics } = await reader.collect();
  const metric = resourceMetrics.scopeMetrics
    .flatMap((scope) => scope.metrics)
    .find((candidate) => candidate.descriptor.name === name);
  return (metric?.dataPoints ?? []).map((point) => ({
    attributes: point.attributes,
    value: point.value,
  }));
}

function setup() {
  const reader = new TestReader();
  const meter = new MeterProvider({ readers: [reader] }).getMeter('test');
  return { reader, meter };
}

describe('createCounterAtZero', () => {
  it('creates every known attribute set at zero', async () => {
    const { reader, meter } = setup();

    createCounterAtZero(meter, 'gpool.pool.actions', { description: 'Pool actions' }, [
      { action: 'create' },
      { action: 'join' },
    ]);

    expect(await points(reader, 'gpool.pool.actions')).toEqual([
      { attributes: { action: 'create' }, value: 0 },
      { attributes: { action: 'join' }, value: 0 },
    ]);
  });

  it('counts on top of zero', async () => {
    const { reader, meter } = setup();
    const counter = createCounterAtZero(meter, 'gpool.pool.actions', {}, [{ action: 'join' }]);

    counter.add(1, { action: 'join' });

    expect(await points(reader, 'gpool.pool.actions')).toEqual([
      { attributes: { action: 'join' }, value: 1 },
    ]);
  });

  it('creates the series without attributes when it knows none', async () => {
    const { reader, meter } = setup();

    createCounterAtZero(meter, 'cv.contact.submissions', {});

    expect(await points(reader, 'cv.contact.submissions')).toEqual([{ attributes: {}, value: 0 }]);
  });
});
