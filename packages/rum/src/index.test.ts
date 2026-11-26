import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const faro = vi.hoisted(() => ({
  initializeFaro: vi.fn(),
  getWebInstrumentations: vi.fn(() => ['web']),
  pushEvent: vi.fn(),
  tracing: vi.fn(),
}));

vi.mock('@grafana/faro-web-sdk', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  initializeFaro: faro.initializeFaro,
  getWebInstrumentations: faro.getWebInstrumentations,
}));

vi.mock('@grafana/faro-web-tracing', () => ({
  TracingInstrumentation: class {
    readonly options: unknown;
    constructor(options: unknown) {
      this.options = options;
      faro.tracing(options);
    }
  },
}));

beforeEach(() => {
  faro.initializeFaro.mockImplementation(() => ({ api: { pushEvent: faro.pushEvent } }));
});

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

interface FaroConfig {
  readonly url: string;
  readonly app: Record<string, string>;
  readonly instrumentations: unknown[];
  readonly trackGeolocation: boolean;
  readonly beforeSend: (item: unknown) => unknown;
}

function configOf(): FaroConfig {
  return faro.initializeFaro.mock.calls[0]?.[0] as FaroConfig;
}

describe('startRum', () => {
  it("starts Faro once, at the app's address, with its name, without console or location", async () => {
    const { startRum } = await import('./index.ts');

    const first = startRum({
      app: 'template-web',
      version: '1f3a9c2',
      environment: 'local',
      url: '/rum',
    });
    const second = startRum({ app: 'template-web', url: '/other' });

    expect(second).toBe(first);
    expect(faro.initializeFaro).toHaveBeenCalledOnce();
    expect(configOf()).toMatchObject({
      url: '/rum',
      app: { name: 'template-web', version: '1f3a9c2', environment: 'local' },
      trackGeolocation: false,
    });
    expect(faro.getWebInstrumentations).toHaveBeenCalledWith({ captureConsole: false });
    expect(configOf().instrumentations[0]).toBe('web');
  });

  it('leaves out a version or an environment it was not given, and traces only the APIs it names', async () => {
    const { startRum } = await import('./index.ts');

    startRum({ app: 'template-web', url: '/rum', apiOrigins: ['https://api.example.com/v1'] });

    expect(configOf().app).toEqual({ name: 'template-web' });
    const tracing = faro.tracing.mock.calls[0]?.[0] as
      | { instrumentationOptions: { propagateTraceHeaderCorsUrls: RegExp[] } }
      | undefined;
    const [patterns] = tracing?.instrumentationOptions.propagateTraceHeaderCorsUrls ?? [];
    expect(patterns?.test('https://api.example.com/notes')).toBe(true);
    expect(patterns?.test('https://api.example.com.evil.test/')).toBe(false);
  });

  it('drops an interaction the app does not list before it leaves the browser', async () => {
    const { startRum } = await import('./index.ts');
    const { TransportItemType } = await import('@grafana/faro-web-sdk');
    startRum({ app: 'template-web', url: '/rum', interactions: ['note.created'] });
    const meta = { app: { name: 'template-web' } };
    const event = (name: string) => ({
      type: TransportItemType.EVENT,
      payload: { name, timestamp: '2026-11-26T12:00:00.000Z' },
      meta,
    });

    expect(configOf().beforeSend(event('note.created'))).not.toBeNull();
    expect(configOf().beforeSend(event('note.exported'))).toBeNull();
  });
});

describe('recordInteraction', () => {
  it('does nothing before Faro starts, and sends a named event afterwards', async () => {
    const { recordInteraction, startRum } = await import('./index.ts');

    recordInteraction('note.created');
    expect(faro.pushEvent).not.toHaveBeenCalled();

    startRum({ app: 'template-web', url: '/rum' });
    recordInteraction('note.created', { size: 'small' });

    expect(faro.pushEvent).toHaveBeenCalledWith('note.created', { size: 'small' });
  });
});
