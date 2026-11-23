import { afterAll, beforeAll, expect } from 'vitest';

export type LogLine = Readonly<Record<string, unknown>>;

export interface CapturedLogs {
  write(line: string): void;
  readonly lines: readonly LogLine[];
  events(): string[];
  find(event: string): LogLine[];
  clear(): void;
}

export function captureLogs(): CapturedLogs {
  const lines: LogLine[] = [];
  return {
    write(line) {
      for (const text of line.split('\n')) {
        if (text.trim() !== '') {
          lines.push(JSON.parse(text) as LogLine);
        }
      }
    },
    lines,
    events: () => lines.flatMap((line) => (typeof line.event === 'string' ? [line.event] : [])),
    find: (event) => lines.filter((line) => line.event === event),
    clear: () => {
      lines.length = 0;
    },
  };
}

export interface Closable {
  close(): unknown;
}

export function useApp<T extends Closable>(build: () => T | Promise<T>): { readonly app: T } {
  let app: T | undefined;
  beforeAll(async () => {
    app = await build();
  });
  afterAll(async () => {
    await app?.close();
  });
  return {
    get app(): T {
      if (app === undefined) {
        throw new Error(
          'useApp gives its app only to tests and hooks that run after its beforeAll'
        );
      }
      return app;
    },
  };
}

export interface InjectedResponse {
  readonly statusCode: number;
  readonly headers: Readonly<Record<string, unknown>>;
  json(): unknown;
}

export interface ExpectedProblem {
  readonly status: number;
  readonly code: string;
  readonly instance?: string;
}

export interface Problem {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance: string;
  readonly code: string;
  readonly params: Readonly<Record<string, unknown>>;
}

export function expectProblem(response: InjectedResponse, expected: ExpectedProblem): Problem {
  expect(response.statusCode).toBe(expected.status);
  expect(String(response.headers['content-type'])).toMatch(/^application\/problem\+json/);
  const body = response.json();
  expect(body).toEqual({
    type: expect.any(String),
    title: expect.any(String),
    status: expected.status,
    detail: expect.any(String),
    instance: expected.instance ?? expect.any(String),
    code: expected.code,
    params: expect.any(Object),
  });
  return body as Problem;
}
