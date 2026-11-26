import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asHtml, textsIn } from '../../../test/texts.ts';
import { messagesOf } from '../../i18n/messages.ts';

const request = vi.hoisted(() => ({ cookie: 'template.session_token=abc' }));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('next/headers.js', () => ({
  headers: async () => new Headers(request.cookie === '' ? {} : { cookie: request.cookie }),
}));

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

let server: Server;
let answerNotes: (url: URL, response: ServerResponse) => void;
let seen: { path: string; cookie: string | undefined }[];
const t = textsIn('en');

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

beforeEach(async () => {
  seen = [];
  answerNotes = (_url, response) => json(response, 200, { items: [note] });
  server = createServer((incoming: IncomingMessage, response) => {
    const url = new URL(incoming.url ?? '/', 'http://stand-in');
    seen.push({ path: `${url.pathname}${url.search}`, cookie: incoming.headers.cookie });
    if (url.pathname === '/api/auth/get-session') {
      json(response, 200, incoming.headers.cookie === undefined ? null : session);
    } else {
      answerNotes(url, response);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  vi.stubEnv('OTEL_SERVICE_NAME', 'template-web');
  vi.stubEnv('LOG_LEVEL', 'error');
  vi.stubEnv('API_URL', `http://127.0.0.1:${(server.address() as AddressInfo).port}`);
});

afterEach(async () => {
  request.cookie = 'template.session_token=abc';
  await new Promise((resolve) => server.close(resolve));
  vi.unstubAllEnvs();
  vi.resetModules();
  Reflect.deleteProperty(globalThis, Symbol.for('zigordev.template-web.logger'));
});

function render(page: ReactNode): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messagesOf('en')} timeZone="UTC">
      <QueryClientProvider client={new QueryClient()}>{page}</QueryClientProvider>
    </NextIntlClientProvider>
  );
}

async function list(search: Record<string, string> = {}): Promise<string> {
  const { default: Notes } = await import('./page.tsx');
  return render(await Notes({ searchParams: Promise.resolve(search) }));
}

describe('the notes list', () => {
  it("lists the person's notes from the API, with the person's cookie, and the way to a new one", async () => {
    const html = await list();

    expect(html).toContain(`<h1>${asHtml(t('notes.title'))}</h1>`);
    expect(html).toContain(`href="/notes/${note.id}"`);
    expect(html).toContain('>Buy milk</a>');
    expect(html).toContain(`>${asHtml(t('notes.open'))}</span>`);
    expect(html).toContain('href="/notes/new"');
    expect(seen.find((call) => call.path.startsWith('/api/v1/notes'))).toEqual({
      path: '/api/v1/notes',
      cookie: 'template.session_token=abc',
    });
  });

  it('asks the API for the status and the search of the address, and keeps them in the filters', async () => {
    const html = await list({ status: 'done', q: 'milk' });

    expect(seen.map((call) => call.path)).toContain('/api/v1/notes?status=done&q=milk');
    expect(html).toContain('href="/notes?q=milk"');
    expect(html).toMatch(
      /aria-current="page"[^>]*href="\/notes\?status=done&amp;q=milk"|href="\/notes\?status=done&amp;q=milk"[^>]*aria-current="page"/
    );
    expect(html).toContain('value="milk"');
  });

  it('says when there is no note yet, and when none matches', async () => {
    answerNotes = (_url, response) => json(response, 200, { items: [] });

    expect(await list()).toContain(asHtml(t('notes.empty')));
    expect(await list({ q: 'tea' })).toContain(asHtml(t('notes.noMatch')));
  });

  it('offers the next page when the API has one', async () => {
    answerNotes = (_url, response) => json(response, 200, { items: [note], nextCursor: 'next' });

    expect(await list({ status: 'open' })).toContain('href="/notes?status=open&amp;cursor=next"');
  });

  it('says the notes could not load when the API does not answer', async () => {
    vi.stubEnv('API_URL', 'http://127.0.0.1:9');
    request.cookie = '';
    const { default: Notes } = await import('./page.tsx');

    await expect(Notes({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({
      digest: expect.stringContaining('/sign-in?next=%2Fnotes'),
    });
  });

  it('shows an alert when the API refuses the list', async () => {
    answerNotes = (_url, response) => json(response, 500, { title: 'Broken' });

    expect(await list()).toContain(asHtml(t('notes.loadFailed')));
  });
});

describe('one note', () => {
  async function one(noteId: string) {
    const { default: Note } = await import('./[noteId]/page.tsx');
    return Note({ params: Promise.resolve({ noteId }) });
  }

  it('shows the note in its form, with the way back and the delete button', async () => {
    answerNotes = (_url, response) => json(response, 200, note);

    const html = render(await one(note.id));

    expect(html).toContain('<h1>Buy milk</h1>');
    expect(html).toContain('value="Buy milk"');
    expect(html).toContain('Two litres</textarea>');
    expect(html).toContain(`>${asHtml(t('notes.delete'))}</button>`);
    expect(html).toContain('href="/notes"');
  });

  it("answers 404 for a note that is missing or someone else's, and for an id that is not one", async () => {
    answerNotes = (_url, response) => json(response, 404, { title: 'Not found' });
    await expect(one(note.id)).rejects.toMatchObject({ digest: expect.stringContaining('404') });

    answerNotes = (_url, response) => json(response, 400, { title: 'Bad request' });
    await expect(one('not-an-id')).rejects.toMatchObject({
      digest: expect.stringContaining('404'),
    });
  });

  it('fails when the API answers anything else', async () => {
    answerNotes = (_url, response) => json(response, 500, { title: 'Broken' });

    await expect(one(note.id)).rejects.toThrow('the API answered 500 for a note');
  });
});

describe('a new note', () => {
  it('offers an empty form, without the done box', async () => {
    const { default: NewNote } = await import('./new/page.tsx');

    const html = render(await NewNote());

    expect(html).toContain(`<h1>${asHtml(t('notes.newTitle'))}</h1>`);
    expect(html).toContain(asHtml(t('notes.titleLabel')));
    expect(html).not.toContain('type="checkbox"');
    expect(html).toContain(`>${asHtml(t('notes.save'))}</button>`);
  });
});
