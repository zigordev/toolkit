import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createLogger } from '@zigordev/otel';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getGreeting, pingApi } from './api.ts';

let server: Server;
let answer: { status: number; body: string };
let paths: string[];
let lines: string[];

beforeEach(async () => {
  answer = { status: 200, body: JSON.stringify({ message: 'Hello from the stand-in' }) };
  paths = [];
  lines = [];
  server = createServer((request, response) => {
    paths.push(request.url ?? '');
    response.writeHead(answer.status, { 'content-type': 'application/json' });
    response.end(answer.body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function url(): string {
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function api(address = url()) {
  const logger = createLogger({
    service: 'template-web',
    destination: { write: (line: string) => lines.push(line) },
  });
  return { url: address, logger };
}

function events(): unknown[] {
  return lines.map((line) => {
    const record = JSON.parse(line) as { level: string; event: string };
    return [record.level, record.event];
  });
}

describe('getGreeting', () => {
  it('asks the API for its greeting', async () => {
    expect(await getGreeting(api())).toBe('Hello from the stand-in');
    expect(paths).toEqual(['/api/v1/hello']);
    expect(lines).toEqual([]);
  });

  it('goes on without a greeting when the API refuses, and writes a warning', async () => {
    answer = { status: 503, body: '{}' };

    expect(await getGreeting(api())).toBeUndefined();
    expect(events()).toEqual([['warn', 'api.refused']]);
  });

  it('goes on without a greeting when the API cannot be reached, and writes a warning', async () => {
    expect(await getGreeting(api('http://127.0.0.1:9'))).toBeUndefined();
    expect(events()).toEqual([['warn', 'api.unreachable']]);
  });

  it('takes an answer without a message for no greeting', async () => {
    answer = { status: 200, body: JSON.stringify({ message: 42 }) };

    expect(await getGreeting(api())).toBeUndefined();
  });
});

describe('pingApi', () => {
  it('finds the API up when its health route answers 200', async () => {
    expect(await pingApi(url())).toBe('up');
    expect(paths).toEqual(['/health']);
  });

  it('finds the API down when its health route answers anything else', async () => {
    answer = { status: 503, body: '{}' };

    expect(await pingApi(url())).toBe('down');
  });
});
