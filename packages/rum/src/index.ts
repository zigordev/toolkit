import { type Faro, getWebInstrumentations, initializeFaro } from '@grafana/faro-web-sdk';
import { TracingInstrumentation } from '@grafana/faro-web-tracing';
import { protectItem } from './privacy.ts';

export interface RumOptions {
  readonly app: string;
  readonly version?: string | undefined;
  readonly environment?: string | undefined;
  readonly url: string;
  readonly apiOrigins?: readonly string[];
  readonly interactions?: readonly string[];
}

let current: Faro | undefined;

function originPattern(origin: string): RegExp {
  const escaped = new URL(origin).origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}(?:/|$)`);
}

export function startRum(options: RumOptions): Faro {
  if (current) {
    return current;
  }
  const interactions = new Set(options.interactions);
  current = initializeFaro({
    url: options.url,
    app: {
      name: options.app,
      ...(options.version === undefined ? {} : { version: options.version }),
      ...(options.environment === undefined ? {} : { environment: options.environment }),
    },
    instrumentations: [
      ...getWebInstrumentations({ captureConsole: false }),
      new TracingInstrumentation({
        instrumentationOptions: {
          propagateTraceHeaderCorsUrls: (options.apiOrigins ?? []).map(originPattern),
        },
      }),
    ],
    trackGeolocation: false,
    beforeSend: (item) => protectItem(item, interactions),
  });
  return current;
}

export function recordInteraction(name: string, attributes?: Record<string, string>): void {
  current?.api.pushEvent(name, attributes);
}
