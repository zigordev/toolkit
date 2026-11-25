import { createElement as h, type ReactElement } from 'react';
import { EmailButton, EmailFooter, EmailHeading, EmailLayout, EmailText } from '../components.ts';
import type { Language } from '../fill.ts';

export const deleteAccountTexts = {
  en: {
    subject: 'Confirm that you want to delete your {{product}} account',
    preview: 'One step to delete your {{product}} account for good',
    heading: 'Delete your account',
    body: 'Select the button while you are signed in to delete your {{product}} account and everything in it, at once and for good. The link works for one hour.',
    button: 'Delete my account',
    footer: 'If you did not ask for this, ignore this email, and your account stays as it is.',
  },
  es: {
    subject: 'Confirma que quieres eliminar tu cuenta de {{product}}',
    preview: 'Un paso para eliminar tu cuenta de {{product}} para siempre',
    heading: 'Elimina tu cuenta',
    body: 'Selecciona el botón con la sesión iniciada para eliminar tu cuenta de {{product}} y todo lo que contiene, al momento y para siempre. El enlace funciona durante una hora.',
    button: 'Eliminar mi cuenta',
    footer: 'Si no lo has pedido, ignora este correo y tu cuenta seguirá como está.',
  },
} as const satisfies Record<Language, Record<string, string>>;

export function DeleteAccount({ lang }: { readonly lang: Language }): ReactElement {
  const texts = deleteAccountTexts[lang];
  return h(
    EmailLayout,
    { lang, preview: texts.preview, footer: h(EmailFooter, null, texts.footer) },
    h(EmailHeading, null, texts.heading),
    h(EmailText, null, texts.body),
    h(EmailButton, { href: '{{link}}' }, texts.button)
  );
}
