import { describe, expect, it } from 'vitest';
import { codeFields, noteFields, signInFields, signUpFields, zodResolver } from './forms.ts';

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

    expect(short.errors).toEqual({
      password: { type: 'too_small', message: 'password-too-short' },
    });
    expect(long.errors).toEqual({ password: { type: 'too_big', message: 'password-too-long' } });
  });

  it('takes a code and whether to trust the device', async () => {
    expect(await resolve(codeFields, { code: ' 123456 ', trust: true })).toEqual({
      values: { code: '123456', trust: true },
      errors: {},
    });
  });
});

describe('the fields of a note', () => {
  it('need a title of at most 200 characters, and a text of at most 10,000', async () => {
    expect(await resolve(noteFields, { title: ' Buy milk ', body: '', done: false })).toEqual({
      values: { title: 'Buy milk', body: '', done: false },
      errors: {},
    });
    expect(
      (await resolve(noteFields, { title: 'x'.repeat(201), body: 'y'.repeat(10_001), done: true }))
        .errors
    ).toEqual({
      title: { type: 'too_big', message: 'title-too-long' },
      body: { type: 'too_big', message: 'body-too-long' },
    });
  });
});
