import { createTranslator } from 'use-intl';
import { describe, expect, it } from 'vitest';
import { messages } from './messages';
import { fieldText, problemText } from './texts';

const t = createTranslator({ locale: 'en', messages: messages.en });
const es = createTranslator({ locale: 'es', messages: messages.es });

describe('fieldText', () => {
  it('says nothing about a field without a problem', () => {
    expect(fieldText(t, undefined)).toBeUndefined();
  });

  it('says what a field needs, in the web app’s words', () => {
    expect(fieldText(t, 'required')).toBe(messages.en.fields.required);
    expect(fieldText(t, 'email')).toBe(messages.en.fields.email);
    expect(fieldText(es, 'required')).toBe(messages.es.fields.required);
  });

  it('asks to check the value for any other problem', () => {
    expect(fieldText(t, 'too_small')).toBe(messages.en.fields.invalid);
  });
});

describe('problemText', () => {
  it('names each problem of sign-in, in the web app’s words', () => {
    expect(problemText(t, 'wrong-credentials', 'x')).toBe(messages.en.problems.wrongCredentials);
    expect(problemText(t, 'not-verified', 'x')).toBe(messages.en.problems.notVerified);
    expect(problemText(t, 'wrong-code', 'x')).toBe(messages.en.problems.wrongCode);
    expect(problemText(t, 'too-many', 'x')).toBe(messages.en.problems.tooMany);
  });

  it('uses the screen’s own words when sign-in just failed', () => {
    expect(problemText(t, 'failed', messages.en.signIn.failed)).toBe(messages.en.signIn.failed);
  });
});
