import { randomBytes, randomInt } from 'node:crypto';
import { MeterProvider, MetricReader } from '@opentelemetry/sdk-metrics';
import { createApi } from '@zigordev/api';
import { createLogger } from '@zigordev/otel';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import pg from 'pg';
import { authenticateWith, serveAuth, userOf } from '../src/fastify.ts';
import {
  type AppAuth,
  type AuthConfig,
  type AuthEmail,
  type AuthMethod,
  createAuth,
} from '../src/index.ts';

export const appUrl = 'http://localhost:3000';
export const secret = randomBytes(32).toString('base64url');
export const strongPassword = 'correct horse battery staple';

export class TestReader extends MetricReader {
  protected override async onShutdown(): Promise<void> {}
  protected override async onForceFlush(): Promise<void> {}
}

export interface MetricPoint {
  readonly attributes: Record<string, unknown>;
  readonly value: unknown;
}

export async function metricPoints(reader: TestReader, name: string): Promise<MetricPoint[]> {
  const { resourceMetrics } = await reader.collect();
  const metric = resourceMetrics.scopeMetrics
    .flatMap((scope) => scope.metrics)
    .find((candidate) => candidate.descriptor.name === name);
  return (metric?.dataPoints ?? []).map((point) => ({
    attributes: point.attributes,
    value: point.value,
  }));
}

export async function metricValue(
  reader: TestReader,
  name: string,
  attributes: Record<string, unknown>
): Promise<unknown> {
  const points = await metricPoints(reader, name);
  return points.find((point) => JSON.stringify(point.attributes) === JSON.stringify(attributes))
    ?.value;
}

export interface HarnessOptions {
  readonly databaseUrl: string;
  readonly methods?: readonly AuthMethod[];
  readonly config?: Partial<AuthConfig>;
  readonly sendEmail?: (email: AuthEmail) => Promise<void>;
  readonly accountDeletion?: boolean;
  readonly twoFactor?: boolean;
  readonly deleteUserData?: (userId: string) => Promise<void>;
  readonly configure?: (app: FastifyInstance) => void;
}

export interface Harness {
  readonly app: FastifyInstance;
  readonly auth: AppAuth;
  readonly outbox: AuthEmail[];
  readonly logs: Record<string, unknown>[];
  readonly reader: TestReader;
  readonly pool: pg.Pool;
  events(name: string): Record<string, unknown>[];
  query<T>(text: string, values?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export async function startHarness(options: HarnessOptions): Promise<Harness> {
  const logs: Record<string, unknown>[] = [];
  const stream = {
    write(line: string) {
      logs.push(JSON.parse(line) as Record<string, unknown>);
    },
  };
  const logger = createLogger({
    service: 'toolkit-auth-test',
    level: 'debug',
    destination: stream,
  });
  const reader = new TestReader();
  const meter = new MeterProvider({ readers: [reader] }).getMeter('test');
  const pool = new pg.Pool({ connectionString: options.databaseUrl, max: 4 });
  const outbox: AuthEmail[] = [];
  const auth = createAuth({
    appName: 'toolkit',
    config: { AUTH_SECRET: secret, AUTH_URL: appUrl, ...options.config },
    methods: options.methods ?? ['email'],
    db: drizzle(pool),
    logger,
    meter,
    sendEmail:
      options.sendEmail ??
      (async (email) => {
        outbox.push(email);
      }),
    ...(options.accountDeletion === undefined ? {} : { accountDeletion: options.accountDeletion }),
    ...(options.twoFactor === undefined ? {} : { twoFactor: options.twoFactor }),
    ...(options.deleteUserData === undefined ? {} : { deleteUserData: options.deleteUserData }),
  });
  const app = await createApi({
    service: 'toolkit-auth-test',
    logger,
    docs: { title: 'Auth test', description: 'The test app of @zigordev/auth', version: '0.0.0' },
    authenticate: authenticateWith(auth),
  });
  await serveAuth(app, auth);
  app.get('/api/v1/me', async (request) => {
    const user = userOf(request);
    return { id: user.id, email: user.email, sessionId: request.authSession?.id };
  });
  options.configure?.(app);
  await app.ready();
  return {
    app,
    auth,
    outbox,
    logs,
    reader,
    pool,
    events: (name) => logs.filter((record) => record.event === name),
    query: async <T>(text: string, values: unknown[] = []) =>
      (await pool.query(text, values)).rows as T[],
    close: async () => {
      await app.close();
      await pool.end();
    },
  };
}

function setCookies(response: LightMyRequestResponse): string[] {
  const header = response.headers['set-cookie'];
  if (header === undefined) {
    return [];
  }
  return Array.isArray(header) ? header : [header];
}

export function cookieAttributes(response: LightMyRequestResponse, name: string): string | null {
  return setCookies(response).find((cookie) => cookie.startsWith(`${name}=`)) ?? null;
}

export class Browser {
  readonly ip: string;
  private readonly app: FastifyInstance;
  private readonly jar = new Map<string, string>();

  constructor(app: FastifyInstance, ip?: string) {
    this.app = app;
    this.ip = ip ?? `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
  }

  cookie(name: string): string | undefined {
    return this.jar.get(name);
  }

  cookieHeader(): string {
    return [...this.jar].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  store(cookies: readonly string[]): void {
    for (const cookie of cookies) {
      const [pair = '', ...attributes] = cookie.split(';').map((part) => part.trim());
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      const expired =
        attributes.some((attribute) => /^max-age=0$/i.test(attribute)) || value === '';
      if (expired) {
        this.jar.delete(name);
      } else {
        this.jar.set(name, value);
      }
    }
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const cookie = this.cookieHeader();
    return {
      'x-forwarded-for': this.ip,
      'user-agent': 'toolkit-auth-test',
      ...(cookie === '' ? {} : { cookie }),
      ...extra,
    };
  }

  async post(
    path: string,
    body: unknown,
    extra: Record<string, string> = {}
  ): Promise<LightMyRequestResponse> {
    const response = await this.app.inject({
      method: 'POST',
      url: path,
      headers: this.headers({ origin: appUrl, 'content-type': 'application/json', ...extra }),
      payload: JSON.stringify(body),
    });
    this.store(setCookies(response));
    return response;
  }

  async get(path: string, extra: Record<string, string> = {}): Promise<LightMyRequestResponse> {
    const response = await this.app.inject({
      method: 'GET',
      url: path,
      headers: this.headers(extra),
    });
    this.store(setCookies(response));
    return response;
  }

  async visit(url: string): Promise<LightMyRequestResponse> {
    const target = new URL(url, appUrl);
    return this.get(`${target.pathname}${target.search}`);
  }
}

export async function registerVerified(
  harness: Harness,
  browser: Browser,
  email: string,
  password = strongPassword
): Promise<string> {
  await browser.post('/api/auth/sign-up/email', { email, password, name: 'Test Person' });
  await harness.auth.settle();
  const message = harness.outbox.findLast(
    (candidate) => candidate.kind === 'verify-email' && candidate.to === email
  );
  if (message?.kind !== 'verify-email') {
    throw new Error(`no verification email for ${email}`);
  }
  await browser.visit(message.url);
  const [user] = await harness.query<{ id: string }>('select id from users where email = $1', [
    email,
  ]);
  if (user === undefined) {
    throw new Error(`no user for ${email}`);
  }
  return user.id;
}

export function pathOf(url: string): string {
  const target = new URL(url, appUrl);
  return `${target.pathname}${target.search}`;
}
