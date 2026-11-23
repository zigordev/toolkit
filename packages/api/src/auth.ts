import type { FastifyInstance, FastifyRequest } from 'fastify';
import { forbidden, unauthorized } from './problems.ts';

export interface Principal {
  readonly id: string;
  readonly scopes: readonly string[];
}

export type Authenticate = (
  request: FastifyRequest
) => Principal | undefined | Promise<Principal | undefined>;

declare module 'fastify' {
  interface FastifyContextConfig {
    public?: boolean;
  }
  interface FastifyRequest {
    principal: Principal | undefined;
  }
}

const publicPrefixes = ['/api/v1/docs'];

function isPublic(request: FastifyRequest): boolean {
  const route = request.routeOptions.url ?? '';
  return (
    request.is404 ||
    request.routeOptions.config.public === true ||
    publicPrefixes.some((prefix) => route === prefix || route.startsWith(`${prefix}/`))
  );
}

export function requireSignIn(app: FastifyInstance, authenticate: Authenticate | undefined): void {
  app.decorateRequest('principal', undefined);
  app.addHook('onRequest', async (request) => {
    if (isPublic(request)) {
      return;
    }
    const principal = authenticate === undefined ? undefined : await authenticate(request);
    if (principal === undefined) {
      throw unauthorized();
    }
    request.principal = principal;
  });
}

export function principalOf(request: FastifyRequest): Principal {
  if (request.principal === undefined) {
    throw unauthorized();
  }
  return request.principal;
}

export function requireScope(request: FastifyRequest, scope: string): Principal {
  const principal = principalOf(request);
  if (!principal.scopes.includes(scope)) {
    throw forbidden(`This request needs the scope ${scope}.`, { scope });
  }
  return principal;
}

export function bearerToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (typeof header !== 'string') {
    return undefined;
  }
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match?.[1];
}
