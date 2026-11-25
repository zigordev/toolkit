import { type Email, fillEmail, type Language } from './fill.ts';
import { messages } from './generated/messages.ts';

export type { Email, EmailTemplate, Language, StandardTemplates } from './fill.ts';
export { fillEmail, languages, placeholdersOf } from './fill.ts';

export interface VerifyEmailOptions {
  readonly lang: Language;
  readonly product: string;
  readonly link: string;
}

export function verifyEmail(options: VerifyEmailOptions): Email {
  return fillEmail(messages.verifyEmail[options.lang], {
    product: options.product,
    link: options.link,
  });
}
