import './jitless.client.ts';
import { useEffect, useEffectEvent, useState } from 'react';
import {
  type ChangeMessage,
  changeEvent,
  livePath,
  parseChangeMessage,
  resyncEvent,
} from './index.ts';

export type LiveState = 'connecting' | 'open' | 'closed';

export interface LiveRetry {
  readonly firstMs: number;
  readonly maxMs: number;
}

export interface UseLiveUpdatesOptions {
  readonly onChange: (message: ChangeMessage) => void;
  readonly onResync?: () => void;
  readonly url?: string;
  readonly enabled?: boolean;
  readonly retry?: LiveRetry;
}

export const defaultRetry: LiveRetry = { firstMs: 1_000, maxMs: 30_000 };
export const stableAfterMs = 10_000;

export function nextDelay(retry: LiveRetry, attempt: number, random: number): number {
  const ceiling = Math.min(retry.maxMs, retry.firstMs * 2 ** attempt);
  return Math.round(ceiling / 2 + (ceiling / 2) * random);
}

export function useLiveUpdates(options: UseLiveUpdatesOptions): LiveState {
  const url = options.url ?? livePath;
  const enabled = options.enabled ?? true;
  const firstMs = options.retry?.firstMs ?? defaultRetry.firstMs;
  const maxMs = options.retry?.maxMs ?? defaultRetry.maxMs;
  const [state, setState] = useState<LiveState>(enabled ? 'connecting' : 'closed');
  const changed = useEffectEvent((message: ChangeMessage) => {
    options.onChange(message);
  });
  const resync = useEffectEvent(() => {
    options.onResync?.();
  });

  useEffect(() => {
    if (!enabled) {
      setState('closed');
      return;
    }
    let source: EventSource | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let openedAt: number | undefined;
    let openedBefore = false;
    let stopped = false;

    const connect = (): void => {
      setState('connecting');
      const next = new EventSource(url);
      source = next;
      next.addEventListener('open', () => {
        openedAt = Date.now();
        setState('open');
        if (openedBefore) {
          resync();
        }
        openedBefore = true;
      });
      next.addEventListener(changeEvent, (event) => {
        const message = parseChangeMessage(String(event.data));
        if (message !== undefined) {
          changed(message);
        }
      });
      next.addEventListener(resyncEvent, () => {
        resync();
      });
      next.addEventListener('error', () => {
        next.close();
        if (stopped) {
          return;
        }
        if (openedAt !== undefined && Date.now() - openedAt >= stableAfterMs) {
          attempt = 0;
        }
        openedAt = undefined;
        setState('connecting');
        timer = setTimeout(connect, nextDelay({ firstMs, maxMs }, attempt, Math.random()));
        attempt += 1;
      });
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      source?.close();
    };
  }, [url, enabled, firstMs, maxMs]);

  return state;
}
