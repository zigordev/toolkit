import { describe, expect, it } from 'vitest';
import { check, codeFields, noteFields, noteLength, signInFields } from './forms';

describe('check', () => {
  it('gives the values back when every field is right, trimmed as the web app trims them', () => {
    expect(check(signInFields, { email: ' ada@example.com ', password: 'secret' })).toEqual({
      values: { email: 'ada@example.com', password: 'secret' },
      problems: {},
    });
  });

  it('names the problem of each field, with the web app’s rules', () => {
    expect(check(signInFields, { email: '', password: '' })).toEqual({
      values: null,
      problems: { email: 'required', password: 'required' },
    });
    expect(check(signInFields, { email: 'ada', password: 'secret' }).problems).toEqual({
      email: 'email',
    });
  });

  it('keeps the first problem of a field', () => {
    expect(
      check(
        {
          safeParse: () => ({
            success: false,
            error: {
              issues: [
                { path: ['code'], message: 'required' },
                { path: ['code'], message: 'other' },
              ],
            },
          }),
        },
        {}
      ).problems
    ).toEqual({ code: 'required' });
  });

  it('checks the code of the second step', () => {
    expect(check(codeFields, { code: '  ', trust: true }).problems).toEqual({ code: 'required' });
    expect(check(codeFields, { code: '123456', trust: true }).values).toEqual({
      code: '123456',
      trust: true,
    });
  });

  it('checks a note with the web app’s lengths', () => {
    expect(check(noteFields, { title: ' ', body: '', done: false }).problems).toEqual({
      title: 'required',
    });
    expect(
      check(noteFields, {
        title: 'x'.repeat(noteLength.title + 1),
        body: 'x'.repeat(noteLength.body + 1),
        done: false,
      }).problems
    ).toEqual({ title: 'title-too-long', body: 'body-too-long' });
    expect(check(noteFields, { title: 'Milk', body: '', done: true }).values).toEqual({
      title: 'Milk',
      body: '',
      done: true,
    });
  });
});
