import { writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { connect } from 'node:net';

export interface Received {
  readonly path: string;
  readonly type: string;
  readonly found: readonly string[];
}

export interface Answer {
  readonly status: number;
  readonly body: string;
}

export interface Held {
  readonly response?: string;
  readonly failure?: string;
}

export const visitorHeaders = {
  'user-agent': 'contract-visitor/1.0',
  'x-forwarded-for': '203.0.113.9',
};

export function serve(port: number, host = '0.0.0.0'): Promise<Server> {
  const received: { path: string; type: string; body: Buffer }[] = [];
  const server = createServer((request, response) => {
    const asked = new URL(request.url ?? '/', 'http://agent');
    if (request.method === 'GET' && asked.pathname === '/__received') {
      const sought = asked.searchParams.getAll('sought');
      const summary: Received[] = received.map((entry) => ({
        path: entry.path,
        type: entry.type,
        found: sought.filter((text) => entry.body.includes(text)),
      }));
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(summary));
      return;
    }
    if (request.method !== 'POST') {
      response.writeHead(404);
      response.end();
      return;
    }
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const type = request.headers['content-type'] ?? '';
      received.push({ path: asked.pathname, type, body: Buffer.concat(chunks) });
      response.writeHead(200, { 'content-type': type || 'application/json' });
      response.end(type.includes('json') ? '{}' : '');
    });
  });
  return new Promise((resolve) => server.listen(port, host, () => resolve(server)));
}

export async function ask(url: string, headers: Record<string, string> = {}): Promise<Answer> {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    return { status: response.status, body: await response.text() };
  } catch (error) {
    return { status: 0, body: error instanceof Error ? error.message : String(error) };
  }
}

export function hold(
  host: string,
  port: number,
  milliseconds: number,
  onSent: () => void = () => undefined
): Promise<Held> {
  return new Promise((resolve) => {
    let answer = '';
    const socket = connect(port, host);
    const give = (held: Held): void => {
      socket.destroy();
      resolve(held);
    };
    socket.setTimeout(milliseconds + 35_000, () => give({ failure: 'no answer came in time' }));
    socket.on('connect', () => {
      socket.write(`GET /health HTTP/1.1\r\nHost: ${host}:${port}\r\nConnection: close\r\n`);
      onSent();
      setTimeout(() => socket.write('\r\n'), milliseconds);
    });
    socket.on('data', (chunk: Buffer) => {
      answer += chunk.toString('latin1');
      const end = answer.indexOf('\r\n');
      if (end !== -1) {
        give({ response: answer.slice(0, end) });
      }
    });
    socket.on('error', (error) => give({ failure: error.message }));
    socket.on('close', () => give({ failure: 'the connection was closed before an answer came' }));
  });
}

export async function main(
  argv: readonly string[],
  write: (text: string) => void,
  serving: (server: Server) => void = () => undefined
): Promise<number> {
  const [command, first = '', second = '', third = '', fourth = '', ...more] = argv;
  if (command === 'serve') {
    serving(await serve(Number(first)));
    return 0;
  }
  if (command === 'ask') {
    write(JSON.stringify(await ask(first, second === 'visitor' ? visitorHeaders : {})));
    return 0;
  }
  if (command === 'received') {
    const sought = new URLSearchParams(
      [second, third, fourth, ...more].filter((text) => text !== '').map((text) => ['sought', text])
    );
    write((await ask(`http://127.0.0.1:${first}/__received?${sought.toString()}`)).body);
    return 0;
  }
  if (command === 'hold') {
    const held = await hold(first, Number(second), Number(third), () =>
      writeFileSync(`${fourth}.sent`, '')
    );
    writeFileSync(fourth, JSON.stringify(held));
    return 0;
  }
  write(
    'Usage: agent serve <port> | ask <url> [visitor] | received <port> [text...] | hold <host> <port> <ms> <file>\n'
  );
  return 2;
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2), (text) => {
    process.stdout.write(text);
  });
}
