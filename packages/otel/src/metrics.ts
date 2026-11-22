import type { Attributes, Counter, Meter, MetricOptions } from '@opentelemetry/api';

export function createCounterAtZero(
  meter: Meter,
  name: string,
  options: MetricOptions,
  knownAttributes: readonly Attributes[] = []
): Counter {
  const counter = meter.createCounter(name, options);
  const sets = knownAttributes.length > 0 ? knownAttributes : [{}];
  for (const attributes of sets) {
    counter.add(0, attributes);
  }
  return counter;
}
