import { describe, expect, it } from 'vitest';
import { type Evidence, type JobEvidence, judge, judgeJob, visitor } from './judge.ts';

const line = (fields: Record<string, unknown>): string =>
  JSON.stringify({ level: 'info', service: 'gpool-api', ...fields });

const sound: Evidence = {
  service: 'gpool-api',
  version: 'local',
  drain: {
    test: [
      'CMD-SHELL',
      'test ! -e /tmp/drain && wget -q -O /dev/null http://127.0.0.1:3000/health',
    ],
    touched: { status: 0, stderr: '' },
    before: 0,
    during: 1,
    after: 0,
  },
  architecture: 'arm64',
  user: '1000:1000',
  bare: { status: 'exited', code: 1 },
  port: '3000',
  health: {
    status: 200,
    body: '{"status":"ok","service":"gpool-api","version":"local","components":{}}',
  },
  moved: { status: 200, body: '{"status":"degraded"}' },
  stdout: `${line({ event: 'service.started' })}\n${line({ event: 'service.stopping' })}\n`,
  stderr: '',
  received: [
    { path: '/v1/traces', type: 'application/x-protobuf', found: ['gpool-api'] },
    { path: '/v1/metrics', type: 'application/x-protobuf', found: ['gpool-api'] },
    { path: '/v1/traces', type: 'application/x-protobuf', found: ['gpool-web', visitor.email] },
  ],
  stop: { code: 0, seconds: 1.234, held: { response: 'HTTP/1.1 200 OK' } },
};

function verdict(promise: number, change: Partial<Evidence>) {
  return judge({ ...sound, ...change }).find((entry) => entry.promise === promise);
}

describe('judge', () => {
  it('finds all seven promises kept by an app that keeps them, and says what it saw', () => {
    expect(judge(sound)).toEqual([
      { promise: 1, kept: true, detail: 'an arm64 image that runs as the user 1000:1000' },
      { promise: 2, kept: true, detail: 'without its settings it stops at once, with code 1' },
      {
        promise: 3,
        kept: true,
        detail:
          'it listens on the port in PORT, and answers GET /health with 200 and its version local',
      },
      { promise: 4, kept: true, detail: '2 lines, all JSON, with nothing a visitor sent' },
      {
        promise: 5,
        kept: true,
        detail: 'traces and metrics reached the agent under the name gpool-api',
      },
      {
        promise: 6,
        kept: true,
        detail:
          'it stopped 1.2 s after a SIGTERM with code 0, and answered the request it had begun',
      },
      {
        promise: 7,
        kept: true,
        detail: 'its health check fails while /tmp/drain exists, and passes again once it is gone',
      },
    ]);
  });

  it.each([
    ['amd64', 'the image is built for amd64, not for arm64'],
    ['', 'the image is built for nothing, not for arm64'],
  ])('1: refuses an image built for "%s"', (architecture, detail) => {
    expect(verdict(1, { architecture })).toEqual({ promise: 1, kept: false, detail });
  });

  it.each(['', 'root', '0', '0:0', 'root:root'])('1: refuses the user "%s" as root', (user) => {
    expect(verdict(1, { user })).toEqual({
      promise: 1,
      kept: false,
      detail: 'the container runs as root',
    });
  });

  it('1: takes a named user that is not root', () => {
    expect(verdict(1, { user: 'node' })?.kept).toBe(true);
  });

  it('2: refuses an app that keeps running without its settings', () => {
    expect(verdict(2, { bare: { status: 'running', code: 0 } })).toEqual({
      promise: 2,
      kept: false,
      detail: 'it keeps running without its settings, when it should stop at once',
    });
  });

  it('2: refuses an app that stops without its settings as if nothing were wrong', () => {
    expect(verdict(2, { bare: { status: 'exited', code: 0 } })?.detail).toBe(
      'without its settings it stops with code 0, as if nothing were wrong'
    );
  });

  it.each([
    [{ status: 503, body: '{"status":"error"}' }, 'answered 503, not 200'],
    [
      { status: 200, body: 'ok' },
      'answered 200, with a body that names no status of ok or degraded',
    ],
    [
      { status: 200, body: '{"status":"error"}' },
      'answered 200, with a body that names no status of ok or degraded',
    ],
    [
      { status: 200, body: '{}' },
      'answered 200, with a body that names no status of ok or degraded',
    ],
    [
      { status: 0, body: 'connect ECONNREFUSED 172.20.0.3:3000\nat somewhere' },
      'gave no answer (connect ECONNREFUSED 172.20.0.3:3000)',
    ],
  ])('3: refuses the health answer %j', (health, said) => {
    expect(verdict(3, { health })).toEqual({
      promise: 3,
      kept: false,
      detail: `GET /health on port 3000 ${said}`,
    });
  });

  it.each([
    ['{"status":"ok"}', 'GET /health names no version, which the deploy asks for from outside'],
    [
      '{"status":"ok","version":""}',
      'GET /health names no version, which the deploy asks for from outside',
    ],
    [
      '{"status":"ok","version":"unknown"}',
      'GET /health names the version unknown, where OTEL_SERVICE_VERSION is local',
    ],
  ])(
    '3: refuses the health answer %s, which does not name the version that runs',
    (body, detail) => {
      expect(verdict(3, { health: { status: 200, body } })).toEqual({
        promise: 3,
        kept: false,
        detail,
      });
    }
  );

  it('3: takes any version an app names when compose.yaml gives it none', () => {
    expect(
      verdict(3, {
        version: undefined,
        health: { status: 200, body: '{"status":"ok","version":"9"}' },
      })?.detail
    ).toBe('it listens on the port in PORT, and answers GET /health with 200 and its version 9');
  });

  it('3: refuses an app that does not answer on another port it was given', () => {
    expect(verdict(3, { moved: { status: 0, body: 'fetch failed' } })?.detail).toBe(
      'started with another PORT, GET /health there gave no answer (fetch failed), so it does not listen on the port it is given'
    );
  });

  it.each([
    ['▲ Next.js 16.4.6', '▲ Next.js 16.4.6'],
    ['[1, 2]', '[1, 2]'],
    ['42', '42'],
    ['null', 'null'],
    [`plain ${'x'.repeat(200)}`, `plain ${'x'.repeat(114)}...`],
  ])('4: refuses the line %s', (plain, shown) => {
    expect(verdict(4, { stdout: `${line({})}\n${plain}\n` })).toEqual({
      promise: 4,
      kept: false,
      detail: `a line on standard output is not JSON: "${shown}"`,
    });
  });

  it('4: refuses anything on the error output', () => {
    expect(verdict(4, { stderr: '\nWarning: something\n  at somewhere\n' })?.detail).toBe(
      'it writes to the error output: "Warning: something"'
    );
  });

  it.each([visitor.address, visitor.email, 'ada%40example.com', visitor.agent, visitor.code])(
    '4: refuses a line that holds %s, which a visitor sent',
    (mark) => {
      expect(verdict(4, { stdout: `${line({ message: `seen ${mark}` })}\n` })?.detail).toBe(
        `its lines hold what a visitor sent: "${mark}"`
      );
    }
  );

  it('4: counts one line as one line, and takes an app that wrote nothing', () => {
    expect(verdict(4, { stdout: `${line({})}\n` })?.detail).toBe(
      '1 line, all JSON, with nothing a visitor sent'
    );
    expect(verdict(4, { stdout: '\n' })?.detail).toBe(
      '0 lines, all JSON, with nothing a visitor sent'
    );
  });

  it.each([
    ['/v1/traces', 'trace'],
    ['/v1/metrics', 'metric'],
  ])('5: refuses an app from which nothing came on %s', (path, kind) => {
    const received = sound.received.filter((entry) => entry.path !== path);

    expect(verdict(5, { received })).toEqual({
      promise: 5,
      kept: false,
      detail: `no ${kind} reached the agent under the name gpool-api`,
    });
  });

  it('5: does not count what came under another name', () => {
    const received = sound.received.map((entry) => ({ ...entry, found: ['gpool-web'] }));

    expect(verdict(5, { received })?.kept).toBe(false);
  });

  it('5: refuses telemetry that holds what a visitor sent', () => {
    const received = [
      ...sound.received,
      { path: '/v1/traces', type: '', found: ['gpool-api', visitor.address] },
    ];

    expect(verdict(5, { received })?.detail).toBe(
      `its telemetry holds what a visitor sent: "${visitor.address}"`
    );
  });

  it.each([
    [{ code: 137, seconds: 30.4 }],
    [{ code: 137, seconds: 2 }],
    [{ code: 0, seconds: 30 }],
  ])('6: refuses an app that had to be killed: %j', (stop) => {
    expect(verdict(6, { stop: { ...sound.stop, ...stop } })?.detail).toBe(
      'it did not stop within 30 seconds of a SIGTERM, and was killed'
    );
  });

  it('6: refuses a stop with a code that says it failed', () => {
    expect(verdict(6, { stop: { ...sound.stop, code: 1 } })?.detail).toBe(
      'it stopped with code 1 after a SIGTERM, which is neither 0 nor 143'
    );
  });

  it('6: takes the code 143, with which a process says a SIGTERM ended it', () => {
    expect(verdict(6, { stop: { ...sound.stop, code: 143 } })?.kept).toBe(true);
  });

  it.each([
    [
      { failure: 'the connection was closed before an answer came' },
      'the connection was closed before an answer came',
    ],
    [{}, 'no answer'],
  ])('6: refuses an app that cut off a request it had begun: %j', (held, reason) => {
    expect(verdict(6, { stop: { ...sound.stop, held } })?.detail).toBe(
      `it cut off a request that had begun before the SIGTERM: ${reason}`
    );
  });
});

const job: JobEvidence = {
  service: 'gpool-api-migrate',
  waitedForBy: ['gpool-api'],
  status: 'exited',
  code: 0,
  stdout: `${line({ event: 'migration.started' })}\n${line({ event: 'migration.finished' })}\n`,
  stderr: '',
};

describe('judge, on draining', () => {
  const drained = sound.drain ?? {
    test: [],
    touched: { status: 0, stderr: '' },
    before: 0,
    during: 1,
    after: 0,
  };

  it.each([
    [
      { ...drained, test: [] },
      'it has no health check, which a deploy waits for and which drains it',
    ],
    [{ ...drained, before: 1 }, 'its health check fails with code 1 while it is healthy'],
    [
      { ...drained, touched: { status: 1, stderr: 'touch: /tmp/drain: Read-only file system\n' } },
      'it cannot write /tmp/drain: touch: /tmp/drain: Read-only file system',
    ],
    [
      { ...drained, during: 0 },
      'its health check still passes while /tmp/drain exists, so the ingress would keep sending it requests while it stops',
    ],
    [{ ...drained, after: 1 }, 'its health check still fails with code 1 once /tmp/drain is gone'],
  ])('7: refuses the drain %j', (drain, detail) => {
    expect(verdict(7, { drain })).toEqual({ promise: 7, kept: false, detail });
  });

  it('7: says why it cannot write /tmp/drain even when the container says nothing', () => {
    expect(verdict(7, { drain: { ...drained, touched: { status: 1, stderr: '' } } })?.detail).toBe(
      'it cannot write /tmp/drain: no reason'
    );
  });

  it('7: takes an app that the ingress does not route', () => {
    expect(verdict(7, { drain: undefined })).toEqual({
      promise: 7,
      kept: true,
      detail: 'the ingress does not route it, so it has nothing to drain',
    });
  });
});

describe('judgeJob', () => {
  it('finds both promises kept by a job that ended with code 0 and printed JSON only', () => {
    expect(judgeJob(job)).toEqual([
      { promise: 1, kept: true, detail: 'it ended with code 0 before gpool-api started' },
      { promise: 2, kept: true, detail: '2 lines, all JSON' },
    ]);
  });

  it('1: refuses a job that ended with another code', () => {
    expect(judgeJob({ ...job, code: 1 })[0]).toEqual({
      promise: 1,
      kept: false,
      detail: 'it ended with code 1',
    });
  });

  it('1: refuses a job that is still running once the product has started', () => {
    expect(judgeJob({ ...job, status: 'running' })[0]?.detail).toBe(
      'it is still running after the product started'
    );
    expect(judgeJob({ ...job, status: '' })[0]?.detail).toBe(
      'it is still missing after the product started'
    );
  });

  it('1: refuses a job that no service waits for', () => {
    expect(judgeJob({ ...job, waitedForBy: [] })[0]).toEqual({
      promise: 1,
      kept: false,
      detail:
        'no service waits for it with depends_on and the condition service_completed_successfully',
    });
  });

  it('1: names every service that waits for it', () => {
    expect(judgeJob({ ...job, waitedForBy: ['gpool-api', 'gpool-worker'] })[0]?.detail).toBe(
      'it ended with code 0 before gpool-api and gpool-worker started'
    );
  });

  it('2: refuses a line that is not JSON, on either output', () => {
    expect(judgeJob({ ...job, stderr: 'Error: relation "notes" already exists\n' })[1]).toEqual({
      promise: 2,
      kept: false,
      detail: 'a line it printed is not JSON: "Error: relation "notes" already exists"',
    });
  });

  it('2: counts one line as one line, and takes a job that printed nothing', () => {
    expect(
      judgeJob({ ...job, stdout: `${line({ event: 'migration.finished' })}\n` })[1]?.detail
    ).toBe('1 line, all JSON');
    expect(judgeJob({ ...job, stdout: '' })[1]?.detail).toBe('0 lines, all JSON');
  });
});
