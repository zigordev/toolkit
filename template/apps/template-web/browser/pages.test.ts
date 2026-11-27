import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { type AddressInfo, createServer as createTcpServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import {
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  chromium,
} from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { textsIn } from '../test/texts.ts';

declare global {
  interface Window {
    blockedByPolicy: string[];
    ranWithoutNonce?: boolean;
  }
}

const folder = fileURLToPath(new URL('..', import.meta.url));
const next = createRequire(import.meta.url).resolve('next/dist/bin/next');
const sessionCookie = 'template.session_token';

const session = {
  user: {
    id: '01938c2e-0000-7000-8000-000000000001',
    email: 'ada@example.com',
    name: 'Ada Lovelace',
    emailVerified: true,
    image: null,
    createdAt: '2026-11-25T10:00:00.000Z',
    updatedAt: '2026-11-25T10:00:00.000Z',
  },
  session: {
    id: '01938c2e-0000-7000-8000-000000000002',
    userId: '01938c2e-0000-7000-8000-000000000001',
    expiresAt: '2026-12-02T10:00:00.000Z',
    createdAt: '2026-11-25T10:00:00.000Z',
    updatedAt: '2026-11-25T10:00:00.000Z',
  },
};

const note = {
  id: '01938c2e-0000-7000-8000-0000000000aa',
  title: 'Buy milk',
  body: 'Two litres',
  status: 'open',
  createdAt: '2026-11-26T10:00:00.000Z',
  updatedAt: '2026-11-26T10:00:00.000Z',
};

const created = {
  ...note,
  id: '01938c2e-0000-7000-8000-0000000000bb',
  title: 'Bake bread',
  body: '',
};

interface Visit {
  readonly path: string;
  readonly signedIn: boolean;
  readonly status: number;
}

const visits: readonly Visit[] = [
  { path: '/', signedIn: false, status: 200 },
  { path: '/sign-in', signedIn: false, status: 200 },
  { path: '/sign-up', signedIn: false, status: 200 },
  { path: '/two-factor', signedIn: false, status: 200 },
  { path: '/account', signedIn: true, status: 200 },
  { path: '/notes', signedIn: true, status: 200 },
  { path: '/notes/new', signedIn: true, status: 200 },
  { path: `/notes/${note.id}`, signedIn: true, status: 200 },
  { path: '/no-such-page', signedIn: false, status: 404 },
];

const locales = ['en', 'es'] as const;
const schemes = ['light', 'dark'] as const;

const live = { holdOpen: false, streams: new Set<ServerResponse>() };
let listed = [note];

let api: Server;
let app: ChildProcess;
let output = '';
let base = '';
let browser: Browser;

function answer(response: ServerResponse, body: unknown, status = 200): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

function standInApi(): Server {
  return createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://stand-in').pathname;
    const signedIn = (request.headers.cookie ?? '').includes(`${sessionCookie}=`);
    if (path === '/api/v1/hello') {
      answer(response, { message: 'Hello from the stand-in' });
    } else if (path === '/api/auth/get-session') {
      answer(response, signedIn ? session : null);
    } else if (path === '/api/auth/sign-out' && request.method === 'POST') {
      response.setHeader('set-cookie', `${sessionCookie}=; Path=/; Max-Age=0; HttpOnly`);
      answer(response, { success: true });
    } else if (path === '/health') {
      answer(response, { status: 'ok' });
    } else if (path === '/api/v1/notes' && request.method === 'POST') {
      answer(response, created, 201);
    } else if (path === '/api/v1/live') {
      response.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
      });
      response.write(': ready\n\n');
      if (live.holdOpen && (request.headers.cookie ?? '').includes(`${sessionCookie}=live-check`)) {
        live.streams.add(response);
        response.on('close', () => live.streams.delete(response));
      } else {
        response.end();
      }
    } else if (path === '/api/v1/notes') {
      answer(response, { items: listed });
    } else if (path === `/api/v1/notes/${note.id}`) {
      answer(response, note);
    } else if (path === `/api/v1/notes/${created.id}`) {
      answer(response, created);
    } else {
      response.writeHead(404);
      response.end();
    }
  });
}

async function freePort(): Promise<number> {
  const probe = createTcpServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function ready(seconds: number): Promise<void> {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    const up = await fetch(`${base}/health`).then(
      (response) => response.ok,
      () => false
    );
    if (up) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`the web app did not get ready:\n${output}`);
}

beforeAll(async () => {
  if (!existsSync(join(folder, '.next', 'BUILD_ID'))) {
    throw new Error('run pnpm build first');
  }
  api = standInApi();
  await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve));
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  app = spawn(process.execPath, [next, 'start', '-p', String(port), '-H', '127.0.0.1'], {
    cwd: folder,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
      OTEL_SERVICE_NAME: 'template-web',
      LOG_LEVEL: 'warn',
      API_URL: `http://127.0.0.1:${(api.address() as AddressInfo).port}`,
      RUM_URL: '/rum',
      OTEL_RESOURCE_ATTRIBUTES: 'deployment.environment.name=test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  app.stdout?.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  app.stderr?.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  await ready(30);
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  app?.kill('SIGKILL');
  await new Promise((resolve) => api?.close(resolve));
});

async function watchedContext(options: BrowserContextOptions = {}): Promise<BrowserContext> {
  const context = await browser.newContext(options);
  await context.route(`${base}/rum`, (route) => route.fulfill({ status: 204 }));
  await context.addInitScript(() => {
    window.blockedByPolicy = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.blockedByPolicy.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  return context;
}

const cases = visits.flatMap((visit) =>
  locales.flatMap((locale) => schemes.map((scheme) => ({ ...visit, locale, scheme })))
);

describe('every page', () => {
  it.each(cases)(
    '$path in $locale and $scheme has no axe finding and breaks no rule of the policy',
    async ({ path, signedIn, status, locale, scheme }) => {
      const context = await watchedContext({ locale, colorScheme: scheme });
      if (signedIn) {
        await context.addCookies([{ name: sessionCookie, value: 'stand-in', url: base }]);
      }
      const page = await context.newPage();
      const errors: string[] = [];
      const ownStatus = `the server responded with a status of ${status}`;
      page.on('console', (message) => {
        if (message.type() === 'error' && !(status !== 200 && message.text().includes(ownStatus))) {
          errors.push(message.text());
        }
      });
      page.on('pageerror', (error) => errors.push(error.message));

      try {
        const response = await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });

        expect(response?.status()).toBe(status);
        expect(response?.headers()['content-security-policy']).toMatch(
          /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/
        );
        expect(await page.getAttribute('html', 'lang')).toBe(locale);
        const { violations } = await new AxeBuilder({ page }).analyze();
        expect(
          violations.map(
            (violation) =>
              `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`
          )
        ).toEqual([]);
        expect(await page.evaluate(() => window.blockedByPolicy)).toEqual([]);
        expect(errors).toEqual([]);
      } finally {
        await context.close();
      }
    }
  );
});

describe('the policy', () => {
  it('refuses a script that carries no nonce, and reports it', async () => {
    const context = await watchedContext();
    const page = await context.newPage();
    await page.route(`${base}/`, async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(
        '</head>',
        '<script>window.ranWithoutNonce = true;</script></head>'
      );
      await route.fulfill({ response, body });
    });
    try {
      await page.goto(`${base}/`, { waitUntil: 'networkidle' });

      expect(await page.evaluate(() => window.ranWithoutNonce)).toBeUndefined();
      expect(await page.evaluate(() => window.blockedByPolicy)).toEqual(['script-src-elem inline']);
    } finally {
      await context.close();
    }
  });
});

describe('the main navigation', () => {
  it('sits at the bottom of a phone, marks the current place and follows the person', async () => {
    const context = await watchedContext({
      locale: 'en',
      colorScheme: 'dark',
      viewport: { width: 390, height: 844 },
    });
    await context.addCookies([{ name: sessionCookie, value: 'stand-in', url: base }]);
    const page = await context.newPage();
    try {
      await page.goto(`${base}/notes`, { waitUntil: 'networkidle' });

      const t = textsIn('en');
      const nav = page.getByRole('navigation', { name: t('nav.label') });
      const box = await nav.boundingBox();
      expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(844);
      expect(
        await nav.getByRole('link', { name: t('nav.notes') }).getAttribute('aria-current')
      ).toBe('page');
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.textContent)).toBe(
        t('app.skipToContent')
      );
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations.map((violation) => violation.id)).toEqual([]);

      await nav.getByRole('link', { name: t('nav.account') }).click();
      await page.waitForURL(`${base}/account`);
      await page.waitForFunction(
        (name) =>
          document.querySelector('[aria-current="page"] .ds-app-nav__label')?.textContent === name,
        t('nav.account')
      );
      expect(await page.evaluate(() => window.blockedByPolicy)).toEqual([]);
    } finally {
      await context.close();
    }
  });
});

describe('the account menu', () => {
  it('turns the page dark and keeps it, switches the language and signs out, under the policy', async () => {
    const context = await watchedContext({ locale: 'en', colorScheme: 'light' });
    await context.addCookies([{ name: sessionCookie, value: 'stand-in', url: base }]);
    const page = await context.newPage();
    try {
      await page.goto(`${base}/account`, { waitUntil: 'networkidle' });

      const t = textsIn('en');
      const label = t('accountMenu.label', { name: session.user.name });
      expect(await page.getAttribute('html', 'data-mode')).toBe('system');
      await page.getByRole('button', { name: label }).click();
      const menu = page.getByRole('menu', { name: label });
      await menu.waitFor();
      await page.waitForFunction(() => document.getAnimations().length === 0);
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(
        violations.map(
          (violation) =>
            `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`
        )
      ).toEqual([]);
      expect(await menu.getByText(session.user.email).isVisible()).toBe(true);

      await menu.getByRole('menuitemradio', { name: t('accountMenu.dark') }).click();
      await page.waitForFunction(() => document.documentElement.dataset.mode === 'dark');
      await expect
        .poll(async () => (await context.cookies()).find((c) => c.name === 'template.mode')?.value)
        .toBe('dark');
      await page.reload({ waitUntil: 'networkidle' });
      expect(await page.getAttribute('html', 'data-mode')).toBe('dark');

      await page.getByRole('button', { name: label }).click();
      await page.getByRole('menuitemradio', { name: t('language.es') }).click();
      await page.waitForFunction(() => document.documentElement.lang === 'es');

      const es = textsIn('es');
      const spanish = es('accountMenu.label', { name: session.user.name });
      await page.getByRole('button', { name: spanish }).click();
      await page.getByRole('menuitem', { name: es('account.signOut') }).click();
      await page.waitForURL(`${base}/`);
      await page.getByRole('navigation', { name: es('language.label') }).waitFor();
      expect(await page.getByRole('button', { name: spanish }).count()).toBe(0);
      expect((await context.cookies()).some((c) => c.name === sessionCookie)).toBe(false);
      expect(await page.evaluate(() => window.blockedByPolicy)).toEqual([]);
    } finally {
      await context.close();
    }
  });
});

describe('the breadcrumbs', () => {
  it('lead from a note back to the list, and shrink to the way back on a phone', async () => {
    const context = await watchedContext({ locale: 'es', colorScheme: 'light' });
    await context.addCookies([{ name: sessionCookie, value: 'stand-in', url: base }]);
    const page = await context.newPage();
    try {
      await page.goto(`${base}/notes/${note.id}`, { waitUntil: 'networkidle' });

      const t = textsIn('es');
      const trail = page.getByRole('navigation', { name: t('nav.breadcrumbs') });
      const current = trail.getByText(note.title);
      const back = trail.getByRole('link', { name: t('nav.notes') });
      expect(await current.getAttribute('aria-current')).toBe('page');
      expect(await current.isVisible()).toBe(true);
      expect(await back.getAttribute('href')).toBe('/notes');

      await page.setViewportSize({ width: 390, height: 844 });
      expect(await current.isVisible()).toBe(false);
      expect(await back.isVisible()).toBe(true);
      expect((await back.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(32);

      await back.click();
      await page.waitForURL(`${base}/notes`);
      expect(await page.evaluate(() => window.blockedByPolicy)).toEqual([]);
    } finally {
      await context.close();
    }
  });
});

describe('the command palette', () => {
  it('opens with the shortcut, goes to a place and switches the language, under the policy', async () => {
    const context = await watchedContext({ locale: 'en', colorScheme: 'light' });
    await context.addCookies([{ name: sessionCookie, value: 'stand-in', url: base }]);
    const page = await context.newPage();
    try {
      await page.goto(`${base}/`, { waitUntil: 'networkidle' });

      const t = textsIn('en');
      const dialog = page.getByRole('dialog', { name: t('palette.label') });
      await page.keyboard.press('Control+k');
      await dialog.waitFor();
      await page.waitForFunction(
        () =>
          document.activeElement?.getAttribute('role') === 'combobox' &&
          document.getAnimations().length === 0
      );
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(
        violations.map(
          (violation) =>
            `${violation.id}: ${violation.nodes.map((node) => `${node.target.join(' ')} ${node.failureSummary ?? ''}`).join(', ')}`
        )
      ).toEqual([]);

      await page.keyboard.type('acc');
      await page.keyboard.press('Enter');
      await page.waitForURL(`${base}/account`);
      await dialog.waitFor({ state: 'detached' });

      await page.getByRole('button', { name: t('palette.label') }).click();
      await dialog.getByRole('option', { name: t('language.es') }).click();
      await page.waitForFunction(() => document.documentElement.lang === 'es');
      await page.getByRole('button', { name: textsIn('es')('palette.label') }).waitFor();
      expect(await page.evaluate(() => window.blockedByPolicy)).toEqual([]);
    } finally {
      await context.close();
    }
  });
});

describe('the notes', () => {
  it('make a new note through the form, through the API, under the policy', async () => {
    const context = await watchedContext({ locale: 'en' });
    await context.addCookies([{ name: sessionCookie, value: 'stand-in', url: base }]);
    const page = await context.newPage();
    try {
      await page.goto(`${base}/notes/new`, { waitUntil: 'networkidle' });

      const t = textsIn('en');
      await page.getByRole('textbox', { name: t('notes.titleLabel') }).fill('Bake bread');
      await page.getByRole('button', { name: t('notes.save') }).click();
      await page.waitForURL(`${base}/notes/${created.id}`);

      expect(await page.getByRole('heading', { level: 1 }).textContent()).toBe('Bake bread');
      expect(await page.evaluate(() => window.blockedByPolicy)).toEqual([]);
    } finally {
      await context.close();
    }
  });
});

describe('live updates', () => {
  it('refresh the notes page when the API says a note changed, through the proxy', async () => {
    live.holdOpen = true;
    const context = await watchedContext({ locale: 'en' });
    await context.addCookies([{ name: sessionCookie, value: 'live-check', url: base }]);
    const page = await context.newPage();
    try {
      await page.goto(`${base}/notes`, { waitUntil: 'domcontentloaded' });
      const deadline = Date.now() + 10_000;
      while (live.streams.size === 0 && Date.now() < deadline) {
        await page.waitForTimeout(50);
      }
      expect(live.streams.size).toBe(1);

      listed = [{ ...note, title: 'Buy oat milk' }];
      const change = { channel: 'notes:u1', changes: [{ type: 'note.updated', id: note.id }] };
      for (const stream of live.streams) {
        stream.write(`event: change\ndata: ${JSON.stringify(change)}\n\n`);
      }

      await page.getByText('Buy oat milk').waitFor({ timeout: 10_000 });
      expect(await page.evaluate(() => window.blockedByPolicy)).toEqual([]);
    } finally {
      live.holdOpen = false;
      listed = [note];
      for (const stream of live.streams) {
        stream.end();
      }
      await context.close();
    }
  });
});

describe('browser monitoring', () => {
  it("sends Faro's telemetry to the app's own address, naming the app, without the query", async () => {
    const context = await watchedContext();
    const posts: string[] = [];
    await context.route(`${base}/rum`, async (route) => {
      posts.push(route.request().postData() ?? '');
      await route.fulfill({ status: 204 });
    });
    const page = await context.newPage();
    try {
      await page.goto(`${base}/?email=ada%40example.com`, { waitUntil: 'networkidle' });
      const deadline = Date.now() + 10_000;
      while (posts.length === 0 && Date.now() < deadline) {
        await page.waitForTimeout(100);
      }

      const sent = posts.join('\n');
      expect(sent).toContain('"name":"template-web"');
      expect(sent).toContain('"environment":"test"');
      expect(sent).not.toContain('ada');
      expect(await page.evaluate(() => window.blockedByPolicy)).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
