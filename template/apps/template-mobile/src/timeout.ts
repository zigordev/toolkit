import { isRefused } from './failure';

type Fetch = typeof globalThis.fetch;

export const requestTimeoutMs = 10_000;
export const retries = 3;

export class RequestTimeoutError extends Error {
  override readonly name = 'RequestTimeoutError';
  readonly afterMs: number;

  constructor(afterMs: number) {
    super(`The API gave no answer within ${afterMs} ms`);
    this.afterMs = afterMs;
  }
}

const lateFetch: Fetch = (input, init) => globalThis.fetch(input, init);

function callerSignal(input: Parameters<Fetch>[0], init: Parameters<Fetch>[1]) {
  if (init?.signal) {
    return init.signal;
  }
  return typeof input === 'object' && 'signal' in input ? input.signal : null;
}

export function withTimeout(fetcher: Fetch = lateFetch, afterMs = requestTimeoutMs): Fetch {
  return (input, init) =>
    new Promise((resolve, reject) => {
      const controller = new AbortController();
      const caller = callerSignal(input, init);
      const forward = () => controller.abort(caller?.reason);
      const timer = setTimeout(() => {
        settle();
        controller.abort();
        reject(new RequestTimeoutError(afterMs));
      }, afterMs);
      const settle = () => {
        clearTimeout(timer);
        caller?.removeEventListener('abort', forward);
      };
      if (caller?.aborted) {
        forward();
      } else {
        caller?.addEventListener('abort', forward);
      }
      fetcher(input, { ...init, signal: controller.signal }).then(
        (response) => {
          settle();
          resolve(response);
        },
        (error: unknown) => {
          settle();
          reject(error);
        }
      );
    });
}

export function shouldRetry(failureCount: number, error: unknown): boolean {
  return !(error instanceof RequestTimeoutError) && !isRefused(error) && failureCount < retries;
}
