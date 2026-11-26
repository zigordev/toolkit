import { describe, expect, it } from 'vitest';
import { codeFields, signInFields, signUpFields, zodResolver } from './forms.ts';

type Resolve = (values: unknown) => Promise<{ values: unknown; errors: unknown }>;

function resolve(schema: Parameters<typeof zodResolver>[0], values: unknown) {
  return (zodResolver(schema) as unknown as Resolve)(values);
}

describe('the resolver', () => {
  it('gives the parsed values, trimmed, when every field holds', async () => {
    expect(await resolve(signInFields, { email: ' ada@example.com ', password: 'secret' })).toEqual(
      {
        values: { email: 'ada@example.com', password: 'secret' },
        errors: {},
      }
    );
  });

  it('names the first problem of each field, as a code the page puts into words', async () => {
    const result = await resolve(signUpFields, {
      name: '  ',
      email: 'not-an-address',
      password: '',
    });

    expect(result).toEqual({
      values: {},
      errors: {
        name: { type: 'too_small', message: 'required' },
        email: { type: 'invalid_format', message: 'email' },
        password: { type: 'too_small', message: 'required' },
      },
    });
  });

  it('holds a new password between 15 and 128 characters', async () => {
    const short = await resolve(signUpFields, {
      name: 'Ada',
      email: 'ada@example.com',
      password: 'x'.repeat(14),
    });
    const long = await resolve(signUpFields, {
      name: 'Ada',
      email: 'ada@example.com',
      password: 'x'.repeat(129),
    });

    expect(short.errors).toEqual({ password: { type: 'too_small', message: 'too-short' } });
    expect(long.errors).toEqual({ password: { type: 'too_big', message: 'too-long' } });
  });

  it('takes a code and whether to trust the device', async () => {
    expect(await resolve(codeFields, { code: ' 123456 ', trust: true })).toEqual({
      values: { code: '123456', trust: true },
      errors: {},
    });
  });
});
