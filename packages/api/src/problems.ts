import * as z from 'zod';

export const problemContentType = 'application/problem+json; charset=utf-8';

const problemTypeBase = 'https://zigordev.com/problems';

export const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  instance: z.string(),
  code: z.string(),
  params: z.record(z.string(), z.unknown()),
});

export type Problem = z.output<typeof problemSchema>;

export interface FieldError {
  readonly in: 'body' | 'headers' | 'params' | 'querystring';
  readonly pointer: string;
  readonly code: string;
  readonly detail: string;
}

const titles: Readonly<Record<number, string>> = {
  400: 'Bad request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not found',
  405: 'Method not allowed',
  406: 'Not acceptable',
  409: 'Conflict',
  413: 'Content too large',
  415: 'Unsupported media type',
  422: 'Unprocessable content',
  429: 'Too many requests',
  500: 'Internal server error',
  503: 'Service unavailable',
};

export function problemType(code: string): string {
  return `${problemTypeBase}/${code.replaceAll(/[._]/g, '-')}`;
}

export function titleFor(status: number): string {
  return titles[status] ?? (status >= 500 ? 'Server error' : 'Request error');
}

export interface ProblemInit {
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly params?: Readonly<Record<string, unknown>>;
  readonly headers?: Readonly<Record<string, string>>;
}

export class ProblemError extends Error {
  override readonly name = 'ProblemError';
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly headers: Readonly<Record<string, string>>;

  constructor(init: ProblemInit) {
    super(init.detail);
    this.status = init.status;
    this.code = init.code;
    this.detail = init.detail;
    this.params = init.params ?? {};
    this.headers = init.headers ?? {};
  }
}

export function buildProblem(init: ProblemInit & { readonly instance: string }): Problem {
  return {
    type: problemType(init.code),
    title: titleFor(init.status),
    status: init.status,
    detail: init.detail,
    instance: init.instance,
    code: init.code,
    params: { ...init.params },
  };
}

export function badRequest(
  code: string,
  detail: string,
  params?: Readonly<Record<string, unknown>>
): ProblemError {
  return new ProblemError({ status: 400, code, detail, ...(params ? { params } : {}) });
}

export function invalidFields(errors: readonly FieldError[]): ProblemError {
  return new ProblemError({
    status: 400,
    code: 'request.invalid',
    detail:
      errors.length === 1
        ? 'One field of the request is invalid. params.errors names it.'
        : `${errors.length} fields of the request are invalid. params.errors names each one.`,
    params: { errors },
  });
}

export function unauthorized(detail = 'The request needs valid credentials.'): ProblemError {
  return new ProblemError({
    status: 401,
    code: 'auth.unauthenticated',
    detail,
    headers: { 'www-authenticate': 'Bearer' },
  });
}

export function forbidden(
  detail = 'The credentials do not allow this request.',
  params?: Readonly<Record<string, unknown>>
): ProblemError {
  return new ProblemError({
    status: 403,
    code: 'auth.forbidden',
    detail,
    ...(params ? { params } : {}),
  });
}

export function notFound(
  code: string,
  detail: string,
  params?: Readonly<Record<string, unknown>>
): ProblemError {
  return new ProblemError({ status: 404, code, detail, ...(params ? { params } : {}) });
}

export function conflict(
  code: string,
  detail: string,
  params?: Readonly<Record<string, unknown>>
): ProblemError {
  return new ProblemError({ status: 409, code, detail, ...(params ? { params } : {}) });
}

const descriptions: Readonly<Record<number, string>> = {
  400: 'The request is invalid. params.errors lists every invalid field.',
  401: 'The request has no valid credentials.',
  403: 'The credentials do not allow this request.',
  404: 'Nothing exists at this address.',
  409: 'The request conflicts with the current state.',
  500: 'The service failed. The body carries no internal detail.',
};

export function problemResponses<const S extends readonly (keyof typeof descriptions)[]>(
  ...statuses: S
): { readonly [K in S[number]]: typeof problemSchema } {
  return Object.fromEntries(
    statuses.map((status) => [status, problemSchema.describe(descriptions[status] ?? '')])
  ) as { readonly [K in S[number]]: typeof problemSchema };
}
