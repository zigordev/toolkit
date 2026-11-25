import type { IncomingHttpHeaders } from 'node:http';
import type { Authenticate, Principal } from '@zigordev/api';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppAuth } from './create-auth.ts';
import type { AuthSessionDetails, AuthUser } from './session.ts';

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
    authSession: AuthSessionDetails | null;
    authCookies: readonly string[] | null;
  }

  interface FastifySchema {
    hide?: boolean;
  }
}

export function headersOf(incoming: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  return headers;
}

function addCookies(reply: FastifyReply, cookies: readonly string[]): void {
  if (cookies.length === 0) {
    return;
  }
  const existing = reply.getHeader('set-cookie');
  const before =
    existing === undefined ? [] : Array.isArray(existing) ? existing : [String(existing)];
  reply.header('set-cookie', [...before, ...cookies]);
}

export function authenticateWith(auth: AppAuth): Authenticate {
  return async (request) => {
    const { session, setCookie } = await auth.authenticate(headersOf(request.headers));
    request.authCookies = setCookie;
    if (session === null) {
      return undefined;
    }
    request.user = session.user;
    request.authSession = session.session;
    const principal: Principal = { id: session.user.id, scopes: [] };
    return principal;
  };
}

export function userOf(request: Pick<FastifyRequest, 'user'>): AuthUser {
  if (request.user === null) {
    throw new Error('userOf needs a signed-in request, so it cannot read a public route');
  }
  return request.user;
}

async function forward(auth: AppAuth, request: FastifyRequest, reply: FastifyReply) {
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const body = hasBody && Buffer.isBuffer(request.body) ? new Uint8Array(request.body) : undefined;
  const response = await auth.handler(
    new Request(new URL(request.url, auth.baseUrl), {
      method: request.method,
      headers: headersOf(request.headers),
      ...(body === undefined ? {} : { body }),
    })
  );
  reply.code(response.status);
  for (const [name, value] of response.headers) {
    if (name !== 'set-cookie') {
      reply.header(name, value);
    }
  }
  addCookies(reply, response.headers.getSetCookie());
  const payload = Buffer.from(await response.arrayBuffer());
  return reply.send(payload.length === 0 ? null : payload);
}

export async function serveAuth(app: FastifyInstance, auth: AppAuth): Promise<void> {
  app.decorateRequest('user', null);
  app.decorateRequest('authSession', null);
  app.decorateRequest('authCookies', null);
  app.addHook('onSend', async (request, reply, payload) => {
    if (request.authCookies !== null) {
      addCookies(reply, request.authCookies);
    }
    return payload;
  });
  app.addHook('onClose', async () => {
    await auth.settle();
  });
  await app.register(async (routes) => {
    routes.removeAllContentTypeParsers();
    routes.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => {
      done(null, body);
    });
    routes.route({
      method: ['GET', 'POST'],
      url: `${auth.basePath}/*`,
      config: { public: true },
      schema: { hide: true },
      handler: (request, reply) => forward(auth, request, reply),
    });
  });
}
