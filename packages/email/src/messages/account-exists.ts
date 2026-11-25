import { createElement as h, type ReactElement } from 'react';
import { EmailFooter, EmailHeading, EmailLayout, EmailText } from '../components.ts';
import type { Language } from '../fill.ts';

export const accountExistsTexts = {
  en: {
    subject: 'Someone tried to sign up to {{product}} with your address',
    preview: 'You already have an account on {{product}}',
    heading: 'You already have an account',
    body: 'Someone tried to create an account on {{product}} with this email address, which already has one. If it was you, sign in instead, or choose a new password if you forgot yours.',
    footer: 'If it was not you, you can ignore this email. Nothing changed in your account.',
  },
  es: {
    subject: 'Alguien intentó registrarse en {{product}} con tu dirección',
    preview: 'Ya tienes una cuenta en {{product}}',
    heading: 'Ya tienes una cuenta',
    body: 'Alguien intentó crear una cuenta en {{product}} con esta dirección de correo, que ya tiene una. Si fuiste tú, inicia sesión, o elige una contraseña nueva si has olvidado la tuya.',
    footer: 'Si no fuiste tú, puedes ignorar este correo. Tu cuenta no ha cambiado.',
  },
} as const satisfies Record<Language, Record<string, string>>;

export function AccountExists({ lang }: { readonly lang: Language }): ReactElement {
  const texts = accountExistsTexts[lang];
  return h(
    EmailLayout,
    { lang, preview: texts.preview, footer: h(EmailFooter, null, texts.footer) },
    h(EmailHeading, null, texts.heading),
    h(EmailText, null, texts.body)
  );
}
