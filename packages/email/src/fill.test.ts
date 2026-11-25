import { describe, expect, it } from 'vitest';
import { type EmailTemplate, fillEmail, languages, placeholdersOf } from './fill.ts';

const template: EmailTemplate = {
  subject: 'Welcome to {{product}}',
  html: '<a href="{{link}}">Open {{product}}</a>',
  text: 'Open {{product}}: {{link}}',
};

describe('the languages', () => {
  it('are English and Spanish, by their short tags', () => {
    expect(languages).toEqual(['en', 'es']);
  });
});

describe('placeholdersOf', () => {
  it('lists each value a template asks for, once', () => {
    expect(placeholdersOf(template)).toEqual(['link', 'product']);
  });
});

describe('fillEmail', () => {
  it('fills every place in the subject, the HTML and the text', () => {
    expect(
      fillEmail(template, { product: 'Notes', link: 'https://notes.zigordev.com/a?b=1' })
    ).toEqual({
      subject: 'Welcome to Notes',
      html: '<a href="https://notes.zigordev.com/a?b=1">Open Notes</a>',
      text: 'Open Notes: https://notes.zigordev.com/a?b=1',
    });
  });

  it('escapes a value in the HTML, and leaves it as it is in the subject and the text', () => {
    const filled = fillEmail(template, { product: 'Tom & "Jerry" <b>', link: 'https://x.test/' });

    expect(filled.html).toBe(
      '<a href="https://x.test/">Open Tom &amp; &quot;Jerry&quot; &lt;b&gt;</a>'
    );
    expect(filled.subject).toBe('Welcome to Tom & "Jerry" <b>');
    expect(filled.text).toContain('Tom & "Jerry" <b>');
  });

  it('refuses a missing value, a value it has no place for, and a link that is not a web address', () => {
    expect(() => fillEmail(template, { product: 'Notes' })).toThrow(
      'The email needs a value for link'
    );
    expect(() =>
      fillEmail(template, { product: 'Notes', link: 'https://x.test', name: 'Ada' })
    ).toThrow('The email has no place for name');
    expect(() => fillEmail(template, { product: 'Notes', link: 'javascript:alert(1)' })).toThrow(
      'starts with https:// or http://'
    );
  });
});
