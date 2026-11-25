import { createElement as h, type ReactElement } from 'react';
import { EmailButton, EmailFooter, EmailHeading, EmailLayout, EmailText } from '../components.ts';
import type { Language } from '../fill.ts';

export const resetPasswordTexts = {
  en: {
    subject: 'Choose a new password for {{product}}',
    preview: 'A link to choose a new password for {{product}}',
    heading: 'Choose a new password',
    body: 'Select the button to choose a new password for {{product}}. The link works for one hour.',
    button: 'Choose a new password',
    footer: 'If you did not ask for this, you can ignore this email. Your password stays the same.',
  },
  es: {
    subject: 'Elige una contraseña nueva para {{product}}',
    preview: 'Un enlace para elegir una contraseña nueva para {{product}}',
    heading: 'Elige una contraseña nueva',
    body: 'Selecciona el botón para elegir una contraseña nueva para {{product}}. El enlace funciona durante una hora.',
    button: 'Elegir una contraseña nueva',
    footer: 'Si no lo has pedido, puedes ignorar este correo. Tu contraseña no cambia.',
  },
} as const satisfies Record<Language, Record<string, string>>;

export function ResetPassword({ lang }: { readonly lang: Language }): ReactElement {
  const texts = resetPasswordTexts[lang];
  return h(
    EmailLayout,
    { lang, preview: texts.preview, footer: h(EmailFooter, null, texts.footer) },
    h(EmailHeading, null, texts.heading),
    h(EmailText, null, texts.body),
    h(EmailButton, { href: '{{link}}' }, texts.button)
  );
}
