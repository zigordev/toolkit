import { createElement as h, type ReactElement } from 'react';
import { EmailButton, EmailFooter, EmailHeading, EmailLayout, EmailText } from '../components.ts';
import type { Language } from '../fill.ts';

export const verifyEmailTexts = {
  en: {
    subject: 'Confirm your email address for {{product}}',
    preview: 'One step to finish signing up to {{product}}',
    heading: 'Confirm your email address',
    body: 'Select the button to confirm that this address is yours, and finish signing up to {{product}}.',
    button: 'Confirm email address',
    footer: 'If you did not ask for this, you can ignore this email.',
  },
  es: {
    subject: 'Confirma tu dirección de correo para {{product}}',
    preview: 'Un paso para terminar de registrarte en {{product}}',
    heading: 'Confirma tu dirección de correo',
    body: 'Selecciona el botón para confirmar que esta dirección es tuya y terminar de registrarte en {{product}}.',
    button: 'Confirmar dirección de correo',
    footer: 'Si no lo has pedido, puedes ignorar este correo.',
  },
} as const satisfies Record<Language, Record<string, string>>;

export function VerifyEmail({ lang }: { readonly lang: Language }): ReactElement {
  const texts = verifyEmailTexts[lang];
  return h(
    EmailLayout,
    { lang, preview: texts.preview, footer: h(EmailFooter, null, texts.footer) },
    h(EmailHeading, null, texts.heading),
    h(EmailText, null, texts.body),
    h(EmailButton, { href: '{{link}}' }, texts.button)
  );
}
