import { describe, expect, it } from 'vitest';
import {
  badRequest,
  buildProblem,
  conflict,
  forbidden,
  invalidFields,
  notFound,
  ProblemError,
  problemResponses,
  problemSchema,
  problemType,
  titleFor,
  unauthorized,
} from './problems.ts';

describe('problemType', () => {
  it('turns a code into an address, with dashes for its dots and underscores', () => {
    expect(problemType('note.not_found')).toBe('https://zigordev.com/problems/note-not-found');
  });
});

describe('titleFor', () => {
  it('names the common statuses, and falls back by class', () => {
    expect(titleFor(404)).toBe('Not found');
    expect(titleFor(418)).toBe('Request error');
    expect(titleFor(502)).toBe('Server error');
  });
});

describe('buildProblem', () => {
  it('builds every field of the format, with empty params when none are given', () => {
    expect(
      buildProblem({ status: 409, code: 'note.locked', detail: 'Locked.', instance: '/x' })
    ).toEqual({
      type: 'https://zigordev.com/problems/note-locked',
      title: 'Conflict',
      status: 409,
      detail: 'Locked.',
      instance: '/x',
      code: 'note.locked',
      params: {},
    });
  });
});

describe('the helpers', () => {
  it.each([
    [badRequest('note.too_long', 'Too long.', { max: 10 }), 400, 'note.too_long', { max: 10 }],
    [badRequest('note.empty', 'Empty.'), 400, 'note.empty', {}],
    [unauthorized(), 401, 'auth.unauthenticated', {}],
    [forbidden(), 403, 'auth.forbidden', {}],
    [forbidden('No.', { scope: 'a' }), 403, 'auth.forbidden', { scope: 'a' }],
    [notFound('note.not_found', 'Gone.', { id: '1' }), 404, 'note.not_found', { id: '1' }],
    [notFound('note.not_found', 'Gone.'), 404, 'note.not_found', {}],
    [conflict('note.exists', 'Exists.', { id: '1' }), 409, 'note.exists', { id: '1' }],
    [conflict('note.exists', 'Exists.'), 409, 'note.exists', {}],
  ])('make a problem with its status, code and params', (error, status, code, params) => {
    expect(error).toBeInstanceOf(ProblemError);
    expect(error).toMatchObject({ status, code, params });
    expect(error.message).toBe(error.detail);
  });

  it('ask for a bearer token on a 401', () => {
    expect(unauthorized().headers).toEqual({ 'www-authenticate': 'Bearer' });
  });

  it('list the invalid fields of a request', () => {
    const field = {
      in: 'body',
      pointer: '/title',
      code: 'too_small',
      detail: 'too short',
    } as const;

    expect(invalidFields([field])).toMatchObject({
      status: 400,
      code: 'request.invalid',
      params: { errors: [field] },
    });
  });
});

describe('problemResponses', () => {
  it('declares the problem schema for each status asked for, with its description', () => {
    const responses = problemResponses(400, 404);

    expect(Object.keys(responses)).toEqual(['400', '404']);
    expect(responses[404].description).toBe('Nothing exists at this address.');
    expect(responses[400].shape).toEqual(problemSchema.shape);
  });
});
