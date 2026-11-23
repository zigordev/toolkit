import { afterAll, describe, expect, it } from 'vitest';
import { captureLogs, expectProblem, type InjectedResponse, useApp } from './app.ts';

describe('captureLogs', () => {
  it('keeps every JSON line it is given, also several in one write', () => {
    const logs = captureLogs();

    logs.write('{"level":"info","event":"service.started"}\n');
    logs.write('{"level":"info","event":"note.created"}\n{"level":"warn","msg":"no event"}\n\n');

    expect(logs.lines).toEqual([
      { level: 'info', event: 'service.started' },
      { level: 'info', event: 'note.created' },
      { level: 'warn', msg: 'no event' },
    ]);
  });

  it('lists the events in order, and finds the lines of one event', () => {
    const logs = captureLogs();
    logs.write('{"event":"note.created","id":1}\n');
    logs.write('{"msg":"no event"}\n');
    logs.write('{"event":"note.created","id":2}\n');

    expect(logs.events()).toEqual(['note.created', 'note.created']);
    expect(logs.find('note.created').map((line) => line.id)).toEqual([1, 2]);
    expect(logs.find('note.deleted')).toEqual([]);
  });

  it('forgets what it kept when cleared', () => {
    const logs = captureLogs();
    logs.write('{"event":"note.created"}\n');

    logs.clear();

    expect(logs.lines).toEqual([]);
  });

  it('refuses a line that is not JSON', () => {
    expect(() => captureLogs().write('plain text\n')).toThrow(SyntaxError);
  });
});

describe('useApp', () => {
  const built: string[] = [];
  const closed: string[] = [];

  describe('within a file', () => {
    const early = useApp(() => ({ close: () => closed.push('early') }));
    let message = '';
    try {
      void early.app;
    } catch (error) {
      message = (error as Error).message;
    }
    const handle = useApp(async () => {
      built.push('app');
      return { name: 'app', close: async () => closed.push('app') };
    });

    it('refuses to give its app before its beforeAll has run', () => {
      expect(message).toMatch(/only to tests and hooks that run after its beforeAll/);
    });

    it('builds the app once, before the first test', () => {
      expect(handle.app.name).toBe('app');
      expect(built).toEqual(['app']);
    });

    it('gives every test the same app', () => {
      expect(handle.app.name).toBe('app');
      expect(built).toEqual(['app']);
    });
  });

  afterAll(() => {
    expect(closed).toEqual(['app', 'early']);
  });
});

function response(
  statusCode: number,
  body: unknown,
  contentType = 'application/problem+json; charset=utf-8'
): InjectedResponse {
  return { statusCode, headers: { 'content-type': contentType }, json: () => body };
}

const notFound = {
  type: 'https://zigordev.com/problems/not-found',
  title: 'Not found',
  status: 404,
  detail: 'No note has the id 42',
  instance: '/api/v1/notes/42',
  code: 'not_found',
  params: { id: '42' },
};

describe('expectProblem', () => {
  it('passes an RFC 9457 problem with the status and the code expected, and returns it', () => {
    const problem = expectProblem(response(404, notFound), { status: 404, code: 'not_found' });

    expect(problem.params).toEqual({ id: '42' });
  });

  it('checks the instance when it is given', () => {
    expect(() =>
      expectProblem(response(404, notFound), {
        status: 404,
        code: 'not_found',
        instance: '/api/v1/notes/7',
      })
    ).toThrow();
  });

  it('fails on another status code', () => {
    expect(() =>
      expectProblem(response(400, { ...notFound, status: 400 }), { status: 404, code: 'not_found' })
    ).toThrow();
  });

  it('fails on another media type', () => {
    expect(() =>
      expectProblem(response(404, notFound, 'application/json'), {
        status: 404,
        code: 'not_found',
      })
    ).toThrow();
  });

  it('fails on another code', () => {
    expect(() =>
      expectProblem(response(404, notFound), { status: 404, code: 'note_not_found' })
    ).toThrow();
  });

  it('fails when a field is missing', () => {
    const { detail: _detail, ...withoutDetail } = notFound;

    expect(() =>
      expectProblem(response(404, withoutDetail), { status: 404, code: 'not_found' })
    ).toThrow();
  });

  it('fails when the body carries a field the standard does not have', () => {
    expect(() =>
      expectProblem(response(404, { ...notFound, stack: 'Error: at line 1' }), {
        status: 404,
        code: 'not_found',
      })
    ).toThrow();
  });
});
