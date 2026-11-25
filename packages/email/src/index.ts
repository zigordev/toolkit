import { type Email, fillEmail, type Language } from './fill.ts';
import { messages } from './generated/messages.ts';

export type {
  Email,
  EmailTemplate,
  Language,
  StandardMessage,
  StandardTemplates,
} from './fill.ts';
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

export interface ResetPasswordOptions {
  readonly lang: Language;
  readonly product: string;
  readonly link: string;
}

export function resetPassword(options: ResetPasswordOptions): Email {
  return fillEmail(messages.resetPassword[options.lang], {
    product: options.product,
    link: options.link,
  });
}

export interface AccountExistsOptions {
  readonly lang: Language;
  readonly product: string;
}

export function accountExists(options: AccountExistsOptions): Email {
  return fillEmail(messages.accountExists[options.lang], { product: options.product });
}

export interface DeleteAccountOptions {
  readonly lang: Language;
  readonly product: string;
  readonly link: string;
}

export function deleteAccount(options: DeleteAccountOptions): Email {
  return fillEmail(messages.deleteAccount[options.lang], {
    product: options.product,
    link: options.link,
  });
}
