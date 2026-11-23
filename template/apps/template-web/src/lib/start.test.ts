import { afterEach, describe, expect, it, vi } from 'vitest';

const otel = vi.hoisted(() => ({ logProcessCrashes: vi.fn(), logStarted: vi.fn() }));
const settings = vi.hoisted(() => ({ failure: undefined as unknown }));
const logger = { name: 'logger' };

vi.mock('@zigordev/otel', () => ({
  logProcessCrashes: otel.logProcessCrashes,
  logStarted: otel.logStarted,
}));
vi.mock('./logger.ts', () => ({
  getLogger: () => {
    if (settings.failure !== undefined) {
      throw settings.failure;
    }
    return logger;
  },
}));

const { start } = await import('./start.ts');

function stopped(): { exit: ReturnType<typeof vi.spyOn>; written: () => string } {
  let written = '';
  vi.spyOn(process.stderr, 'write').mockImplementation((text) => {
    written += String(text);
    return true;
  });
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  return { exit, written: () => written };
}

afterEach(() => {
  settings.failure = undefined;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('start', () => {
  it('watches for crashes and writes service.started', () => {
    start();

    expect(otel.logProcessCrashes).toHaveBeenCalledWith(logger);
    expect(otel.logStarted).toHaveBeenCalledWith(logger);
  });

  it('stops the process at once, and says why, when a setting is missing', () => {
    settings.failure = new Error('Invalid configuration:\n- API_URL: is missing');
    const { exit, written } = stopped();

    start();

    expect(written()).toBe('Invalid configuration:\n- API_URL: is missing\n');
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('stops the process as well when what went wrong is no error', () => {
    settings.failure = 'no settings';
    const { exit, written } = stopped();

    start();

    expect(written()).toBe('no settings\n');
    expect(exit).toHaveBeenCalledWith(1);
  });
});
