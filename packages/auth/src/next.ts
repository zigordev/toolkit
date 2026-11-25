import type { Logger } from '@zigordev/otel';
import type { AppAuth } from './create-auth.ts';
import { maskedError } from './library-logger.ts';
import { type AuthSession, type AuthUser, parseSession } from './session.ts';

export type RouteHandler = (request: Request) => Promise<Response>;

export interface NextAuthHandlers {
  readonly GET: RouteHandler;
  readonly POST: RouteHandler;
}

interface NextAuthCommonOptions {
  readonly signInPath?: string;
  readonly logger?: Logger;
  readonly headers?: () => Promise<Headers>;
  readonly redirect?: (url: string) => never;
}

export interface NextAuthLocalOptions extends NextAuthCommonOptions {
  readonly auth: AppAuth;
}

export interface NextAuthApiOptions extends NextAuthCommonOptions {
  readonly apiUrl: string;
}

export type NextAuthOptions = NextAuthLocalOptions | NextAuthApiOptions;

export interface NextAuth {
  readonly handlers: NextAuthHandlers;
  getSession(): Promise<AuthSession | null>;
  getUser(): Promise<AuthUser | null>;
  requireUser(returnTo?: string): Promise<AuthUser>;
}

const requestOnly = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const responseOnly = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'set-cookie',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const sessionPath = '/api/auth/get-session?disableRefresh=true';

function originOf(apiUrl: string): URL {
  const url = new URL(apiUrl);
  if (url.pathname !== '/' || url.search !== '') {
    throw new Error(`apiUrl must be an origin with no path: ${apiUrl}`);
  }
  return url;
}

function unavailable(): Response {
  return Response.json(
    { code: 'AUTH_UNAVAILABLE', message: 'Sign-in is unavailable. Try again shortly.' },
    { status: 502 }
  );
}

export function forwardToApi(apiUrl: string, logger?: Logger): RouteHandler {
  const api = originOf(apiUrl);
  return async (request) => {
    const incoming = new URL(request.url);
    const headers = new Headers();
    request.headers.forEach((value, name) => {
      if (!requestOnly.has(name)) {
        headers.set(name, value);
      }
    });
    const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
    let upstream: Response;
    try {
      upstream = await fetch(new URL(`${incoming.pathname}${incoming.search}`, api), {
        method: request.method,
        headers,
        redirect: 'manual',
        cache: 'no-store',
        ...(hasBody ? { body: await request.arrayBuffer() } : {}),
      });
    } catch (error) {
      logger?.error({ event: 'auth.api_unreachable', error: maskedError(error) });
      return unavailable();
    }
    const responseHeaders = new Headers();
    upstream.headers.forEach((value, name) => {
      if (!responseOnly.has(name)) {
        responseHeaders.set(name, value);
      }
    });
    for (const cookie of upstream.headers.getSetCookie()) {
      responseHeaders.append('set-cookie', cookie);
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  };
}

export async function fetchSessionFromApi(
  apiUrl: string,
  headers: Headers
): Promise<AuthSession | null> {
  const cookie = headers.get('cookie');
  if (cookie === null || cookie === '') {
    return null;
  }
  const forwarded = new Headers({ cookie });
  for (const name of ['user-agent', 'x-forwarded-for']) {
    const value = headers.get(name);
    if (value !== null) {
      forwarded.set(name, value);
    }
  }
  const response = await fetch(new URL(sessionPath, originOf(apiUrl)), {
    headers: forwarded,
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`The API answered ${response.status} when asked for the session`);
  }
  return parseSession(await response.json());
}

async function nextHeaders(): Promise<Headers> {
  const { headers } = await import('next/headers.js');
  return headers();
}

async function nextRedirect(url: string): Promise<never> {
  const { redirect } = await import('next/navigation.js');
  return redirect(url);
}

export function signInUrl(signInPath: string, returnTo: string): string {
  const safe = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/';
  return `${signInPath}?next=${encodeURIComponent(safe)}`;
}

export function createNextAuth(options: NextAuthOptions): NextAuth {
  const readHeaders = options.headers ?? nextHeaders;
  const signInPath = options.signInPath ?? '/sign-in';
  const load =
    'auth' in options
      ? (headers: Headers) => options.auth.getSession(headers)
      : (headers: Headers) => fetchSessionFromApi(options.apiUrl, headers);
  const handlers: NextAuthHandlers =
    'auth' in options
      ? {
          GET: (request) => options.auth.handler(request),
          POST: (request) => options.auth.handler(request),
        }
      : (() => {
          const forward = forwardToApi(options.apiUrl, options.logger);
          return { GET: forward, POST: forward };
        })();
  const sessions = new WeakMap<Headers, Promise<AuthSession | null>>();

  async function getSession(): Promise<AuthSession | null> {
    const headers = await readHeaders();
    let session = sessions.get(headers);
    if (session === undefined) {
      session = load(headers);
      sessions.set(headers, session);
    }
    return session;
  }

  async function getUser(): Promise<AuthUser | null> {
    return (await getSession())?.user ?? null;
  }

  return {
    handlers,
    getSession,
    getUser,
    async requireUser(returnTo = '/') {
      const user = await getUser();
      if (user !== null) {
        return user;
      }
      const target = signInUrl(signInPath, returnTo);
      return options.redirect ? options.redirect(target) : nextRedirect(target);
    },
  };
}
