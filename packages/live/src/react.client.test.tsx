import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';
import {
  defaultRetry,
  nextDelay,
  stableAfterMs,
  type UseLiveUpdatesOptions,
  useLiveUpdates,
} from './react.client.ts';

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

class FakeEventSource extends EventTarget {
  static made: FakeEventSource[] = [];
  readonly url: string;
  closed = false;

  constructor(url: string | URL) {
    super();
    this.url = String(url);
    FakeEventSource.made.push(this);
  }

  close(): void {
    this.closed = true;
  }

  static latest(): FakeEventSource {
    const source = FakeEventSource.made.at(-1);
    if (source === undefined) {
      throw new Error('No stream was opened');
    }
    return source;
  }
}

function emit(source: FakeEventSource, event: Event): void {
  act(() => {
    source.dispatchEvent(event);
  });
}

function Probe(props: UseLiveUpdatesOptions) {
  return <output>{useLiveUpdates(props)}</output>;
}

let root: Root | undefined;
let container: HTMLElement | undefined;

async function show(props: UseLiveUpdatesOptions): Promise<void> {
  if (root === undefined) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }
  const current = root;
  await act(async () => {
    current.render(<Probe {...props} />);
  });
}

function state(): string | null | undefined {
  return container?.querySelector('output')?.textContent;
}

beforeEach(() => {
  FakeEventSource.made = [];
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  const current = root;
  if (current !== undefined) {
    act(() => current.unmount());
  }
  container?.remove();
  root = undefined;
  container = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const change = '{"channel":"notes:u1","changes":[{"type":"note.updated","id":"n1"}]}';

describe('useLiveUpdates', () => {
  it('connects to the live route, and says when the stream is open', async () => {
    await show({ onChange: vi.fn() });

    expect(FakeEventSource.latest().url).toBe('/api/v1/live');
    expect(state()).toBe('connecting');

    emit(FakeEventSource.latest(), new Event('open'));

    expect(state()).toBe('open');
  });

  it('connects to the address it is given', async () => {
    await show({ onChange: vi.fn(), url: '/api/v2/live' });

    expect(FakeEventSource.latest().url).toBe('/api/v2/live');
  });

  it('hands each change to the page, and skips a message it cannot read', async () => {
    const onChange = vi.fn();
    await show({ onChange });
    const source = FakeEventSource.latest();
    emit(source, new Event('open'));

    emit(source, new MessageEvent('change', { data: change }));
    emit(source, new MessageEvent('change', { data: '{"channel":"notes:u1"}' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      channel: 'notes:u1',
      changes: [{ type: 'note.updated', id: 'n1' }],
    });
  });

  it('calls the newest handler the page gave', async () => {
    const first = vi.fn();
    const second = vi.fn();
    await show({ onChange: first });
    await show({ onChange: second });

    emit(FakeEventSource.latest(), new MessageEvent('change', { data: change }));

    expect(FakeEventSource.made).toHaveLength(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('asks the page to fetch again when the service asks for a resync', async () => {
    const onResync = vi.fn();
    await show({ onChange: vi.fn(), onResync });
    const source = FakeEventSource.latest();
    emit(source, new Event('open'));

    emit(source, new MessageEvent('resync', { data: '{}' }));

    expect(onResync).toHaveBeenCalledTimes(1);
  });

  it('takes a resync without a handler for it', async () => {
    await show({ onChange: vi.fn() });
    const source = FakeEventSource.latest();

    emit(source, new MessageEvent('resync', { data: '{}' }));
    emit(source, new Event('open'));
    emit(source, new Event('error'));

    expect(state()).toBe('connecting');
  });

  it('connects again after a pause when the stream breaks, and asks the page to catch up', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const onResync = vi.fn();
    await show({ onChange: vi.fn(), onResync, retry: { firstMs: 20, maxMs: 40 } });
    const first = FakeEventSource.latest();
    emit(first, new Event('open'));

    emit(first, new Event('error'));

    expect(first.closed).toBe(true);
    expect(state()).toBe('connecting');
    await vi.waitFor(() => expect(FakeEventSource.made).toHaveLength(2));
    expect(onResync).not.toHaveBeenCalled();

    emit(FakeEventSource.latest(), new Event('open'));

    expect(state()).toBe('open');
    expect(onResync).toHaveBeenCalledTimes(1);
  });

  it('keeps growing the pause while each stream breaks as soon as it opens', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const timers = vi.spyOn(window, 'setTimeout');
    await show({ onChange: vi.fn(), retry: { firstMs: 10, maxMs: 1_000 } });

    for (let count = 1; count <= 3; count += 1) {
      await vi.waitFor(() => expect(FakeEventSource.made).toHaveLength(count));
      emit(FakeEventSource.latest(), new Event('open'));
      emit(FakeEventSource.latest(), new Event('error'));
    }

    const pauses = timers.mock.calls.map(([, delay]) => delay).filter((delay) => Number(delay) > 0);
    expect(pauses).toEqual([10, 20, 40]);
  });

  it('starts the pauses over after a stream that stayed open', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const timers = vi.spyOn(window, 'setTimeout');
    await show({ onChange: vi.fn(), retry: { firstMs: 10, maxMs: 1_000 } });
    emit(FakeEventSource.latest(), new Event('open'));
    emit(FakeEventSource.latest(), new Event('error'));
    await vi.waitFor(() => expect(FakeEventSource.made).toHaveLength(2));

    emit(FakeEventSource.latest(), new Event('open'));
    clock.mockReturnValue(1_000_000 + stableAfterMs);
    emit(FakeEventSource.latest(), new Event('error'));

    const pauses = timers.mock.calls.map(([, delay]) => delay).filter((delay) => Number(delay) > 0);
    expect(pauses).toEqual([10, 10]);
  });

  it('does not connect while it is switched off, and connects once it is switched on', async () => {
    await show({ onChange: vi.fn(), enabled: false });

    expect(FakeEventSource.made).toHaveLength(0);
    expect(state()).toBe('closed');

    await show({ onChange: vi.fn(), enabled: true });

    expect(FakeEventSource.made).toHaveLength(1);
    expect(state()).toBe('connecting');
  });

  it('closes the stream when it is switched off', async () => {
    await show({ onChange: vi.fn() });
    const source = FakeEventSource.latest();

    await show({ onChange: vi.fn(), enabled: false });

    expect(source.closed).toBe(true);
    expect(state()).toBe('closed');
  });

  it('closes the stream when the page leaves, and does not come back', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await show({ onChange: vi.fn(), retry: { firstMs: 20, maxMs: 20 } });
    const source = FakeEventSource.latest();
    emit(source, new Event('error'));
    const current = root;

    act(() => current?.unmount());
    root = undefined;
    source.dispatchEvent(new Event('error'));
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(source.closed).toBe(true);
    expect(FakeEventSource.made).toHaveLength(1);
  });
});

describe('the browser entry', () => {
  it('switches zod to jitless, so a strict content security policy reports nothing', () => {
    expect(z.config().jitless).toBe(true);
  });
});

describe('nextDelay', () => {
  it('doubles the pause after each failed try, up to the most, with a random half', () => {
    expect(nextDelay(defaultRetry, 0, 0)).toBe(500);
    expect(nextDelay(defaultRetry, 0, 1)).toBe(1_000);
    expect(nextDelay(defaultRetry, 3, 1)).toBe(8_000);
    expect(nextDelay(defaultRetry, 10, 1)).toBe(30_000);
    expect(nextDelay(defaultRetry, 10, 0)).toBe(15_000);
  });
});
