import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  type ZodFastifySchemaValidationError,
} from 'fastify-type-provider-zod';
import {
  buildProblem,
  type FieldError,
  invalidFields,
  ProblemError,
  type ProblemInit,
  problemContentType,
} from './problems.ts';

type Location = FieldError['in'];

const locations = new Set<Location>(['body', 'headers', 'params', 'querystring']);

const clientErrorCodes: Readonly<Record<number, string>> = {
  400: 'request.malformed',
  404: 'route.not_found',
  405: 'request.method_not_allowed',
  406: 'request.not_acceptable',
  413: 'request.too_large',
  415: 'request.unsupported_media_type',
};

function locationOf(value: unknown): Location {
  return typeof value === 'string' && locations.has(value as Location)
    ? (value as Location)
    : 'body';
}

function pointerFor(path: string): string {
  return path === '/' ? '' : path;
}

export function fieldErrors(
  issues: readonly ZodFastifySchemaValidationError[],
  context: unknown
): FieldError[] {
  const location = locationOf(context);
  return issues.flatMap((issue): FieldError[] => {
    const keys = issue.params.keys;
    if (issue.keyword === 'unrecognized_keys' && Array.isArray(keys)) {
      return keys.map((key) => ({
        in: location,
        pointer: `${pointerFor(issue.instancePath)}/${String(key)}`,
        code: 'unrecognized_key',
        detail: `${String(key)} is not a known field`,
      }));
    }
    return [
      {
        in: location,
        pointer: pointerFor(issue.instancePath),
        code: issue.keyword,
        detail: issue.message ?? 'is invalid',
      },
    ];
  });
}

export function instanceOf(request: FastifyRequest): string {
  return request.url.split('?')[0] ?? request.url;
}

export function sendProblem(
  request: FastifyRequest,
  reply: FastifyReply,
  init: ProblemInit
): FastifyReply {
  return reply
    .code(init.status)
    .headers(init.headers ?? {})
    .type(problemContentType)
    .serializer(JSON.stringify)
    .send(buildProblem({ ...init, instance: instanceOf(request) }));
}

function statusOf(error: unknown): number {
  const status =
    typeof error === 'object' && error !== null ? Reflect.get(error, 'statusCode') : undefined;
  return typeof status === 'number' && status >= 400 && status < 600 ? status : 500;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'The request was rejected.';
}

export function handleErrors(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ProblemError) {
      return sendProblem(request, reply, error);
    }
    if (hasZodFastifySchemaValidationErrors(error)) {
      return sendProblem(
        request,
        reply,
        invalidFields(fieldErrors(error.validation, Reflect.get(error, 'validationContext')))
      );
    }
    const status = statusOf(error);
    if (status < 500) {
      return sendProblem(request, reply, {
        status,
        code: clientErrorCodes[status] ?? 'request.rejected',
        detail: messageOf(error),
      });
    }
    request.log.error({
      event: 'request.failed',
      method: request.method,
      route: request.routeOptions.url,
      statusCode: 500,
      error,
    });
    return sendProblem(request, reply, {
      status: 500,
      code: 'server.error',
      detail: 'The service could not complete the request.',
    });
  });

  app.setNotFoundHandler((request, reply) =>
    sendProblem(request, reply, {
      status: 404,
      code: 'route.not_found',
      detail: `No route matches ${request.method} ${instanceOf(request)}.`,
    })
  );
}
