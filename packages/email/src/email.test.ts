import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { describe, expect, it } from 'vitest';
import { messagesModule } from '../scripts/generate.ts';
import {
  EmailButton,
  EmailHeading,
  EmailLayout,
  EmailText,
  renderStandardMessages,
  renderTemplate,
  theme,
} from './build.ts';
import { messages } from './generated/messages.ts';
import { accountExists, deleteAccount, languages, resetPassword, verifyEmail } from './index.ts';

describe('the standard messages', () => {
  it('match their saved copy, in English and in Spanish', async () => {
    const rendered = await renderStandardMessages();
    const saved = readFileSync(new URL('./generated/messages.ts', import.meta.url), 'utf8');

    expect(rendered).toEqual(messages);
    expect(saved).toBe(messagesModule(rendered));
    expect(Object.keys(rendered)).toEqual([
      'verifyEmail',
      'resetPassword',
      'accountExists',
      'deleteAccount',
    ]);
    for (const templates of Object.values(rendered)) {
      expect(Object.keys(templates)).toEqual([...languages]);
    }
  });

  it('keep the values for the send as places to fill, never as filled text', () => {
    for (const name of ['verifyEmail', 'resetPassword', 'deleteAccount'] as const) {
      for (const lang of languages) {
        const template = messages[name][lang];
        expect(template.html).toContain('href="{{link}}"');
        expect(template.text).toContain('{{link}}');
        expect(template.subject).toContain('{{product}}');
      }
    }
  });

  it('give the notice of a second sign-up no link at all', () => {
    for (const lang of languages) {
      const template = messages.accountExists[lang];
      expect(template.html).not.toContain('{{link}}');
      expect(template.subject).toContain('{{product}}');
    }
  });
});

describe('verifyEmail', () => {
  const link = 'https://notes.zigordev.com/verify?token=abc';

  it('fills in the product and the link, in English', () => {
    const email = verifyEmail({ lang: 'en', product: 'Notes', link });

    expect(email.subject).toBe('Confirm your email address for Notes');
    expect(email.html).toContain('<html dir="ltr" lang="en">');
    expect(email.html).toContain(`href="${link}"`);
    expect(email.html).toContain('Confirm email address');
    expect(email.text).toContain(link);
    expect(email.html).not.toContain('{{');
  });

  it('speaks Spanish when asked to', () => {
    const email = verifyEmail({ lang: 'es', product: 'Notes', link });

    expect(email.subject).toBe('Confirma tu dirección de correo para Notes');
    expect(email.html).toContain('lang="es"');
    expect(email.html).toContain('Confirmar dirección de correo');
  });

  it('wears the brand: the lavender button and the precise corners', () => {
    const { html } = verifyEmail({ lang: 'en', product: 'Notes', link });

    expect(html).toContain(`background-color:${theme.colors.accent}`);
    expect(html).toContain(`border-radius:${theme.radius.button}`);
  });
});

describe('the sign-in messages', () => {
  const link = 'https://notes.zigordev.com/reset?token=abc';

  it('send a link to choose a new password, valid for an hour', () => {
    const email = resetPassword({ lang: 'en', product: 'Notes', link });

    expect(email.subject).toBe('Choose a new password for Notes');
    expect(email.html).toContain(`href="${link}"`);
    expect(email.text).toContain('The link works for one hour.');
    expect(resetPassword({ lang: 'es', product: 'Notes', link }).subject).toBe(
      'Elige una contraseña nueva para Notes'
    );
  });

  it('tell the owner of an address that someone tried to sign up with it, with no link', () => {
    const email = accountExists({ lang: 'en', product: 'Notes' });

    expect(email.subject).toBe('Someone tried to sign up to Notes with your address');
    expect(email.html).not.toContain('href="http');
    expect(accountExists({ lang: 'es', product: 'Notes' }).html).toContain('Ya tienes una cuenta');
  });

  it('ask the user to confirm the deletion while signed in', () => {
    const email = deleteAccount({ lang: 'en', product: 'Notes', link });

    expect(email.subject).toBe('Confirm that you want to delete your Notes account');
    expect(email.html).toContain('Delete my account');
    expect(email.html).toContain(`href="${link}"`);
    expect(deleteAccount({ lang: 'es', product: 'Notes', link }).html).toContain(
      'Eliminar mi cuenta'
    );
  });
});

describe('renderTemplate', () => {
  it('refuses a message whose plain text would lose a place to fill', async () => {
    await expect(
      renderTemplate(h(EmailLayout, null, h('img', { src: '{{picture}}', alt: '' })), 'A picture')
    ).rejects.toThrow('The plain text of the email lost the places for picture');
  });

  it("renders a product's own message, with muted text and no preview", async () => {
    const template = await renderTemplate(
      h(
        EmailLayout,
        { lang: 'es' },
        h(EmailHeading, null, 'Hola {{name}}'),
        h(EmailText, { tone: 'muted' }, 'Una nota nueva'),
        h(EmailButton, { href: '{{link}}' }, 'Abrir la nota')
      ),
      'Nota nueva'
    );

    expect(template.subject).toBe('Nota nueva');
    expect(template.html).toContain(`color:${theme.colors.muted}`);
    expect(template.text).toContain('Hola {{name}}');
  });
});
