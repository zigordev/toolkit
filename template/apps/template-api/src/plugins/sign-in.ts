import type { Authenticate } from '@zigordev/api';
import type { AuthEmail, AuthEmailSender } from '@zigordev/auth';
import {
  accountExists,
  deleteAccount,
  type Email,
  type Language,
  languages,
  resetPassword,
  verifyEmail,
} from '@zigordev/email';
import type { Logger } from '@zigordev/otel';

export function anyOf(...ways: readonly Authenticate[]): Authenticate {
  return async (request) => {
    for (const way of ways) {
      const principal = await way(request);
      if (principal !== undefined) {
        return principal;
      }
    }
    return undefined;
  };
}

export function languageOf(request: Request | undefined): Language {
  const asked = (request?.headers.get('accept-language') ?? '')
    .split(',')
    .map((part) => part.split(';')[0]?.trim().split('-')[0]?.toLowerCase() ?? '');
  return (
    asked.find((tag): tag is Language => (languages as readonly string[]).includes(tag)) ?? 'en'
  );
}

export function emailOf(message: AuthEmail, product: string): Email {
  const lang = languageOf(message.request);
  switch (message.kind) {
    case 'verify-email':
      return verifyEmail({ lang, product, link: message.url });
    case 'reset-password':
      return resetPassword({ lang, product, link: message.url });
    case 'account-exists':
      return accountExists({ lang, product });
    case 'delete-account':
      return deleteAccount({ lang, product, link: message.url });
  }
}

export interface HeldEmail {
  readonly message: AuthEmail;
  readonly email: Email;
}

export interface HeldEmails {
  readonly emails: readonly HeldEmail[];
  readonly send: AuthEmailSender;
}

export const heldEmailsKept = 50;

export function holdEmails(product: string, logger: Logger): HeldEmails {
  const emails: HeldEmail[] = [];
  return {
    emails,
    send: async (message) => {
      emails.push({ message, email: emailOf(message, product) });
      emails.splice(0, Math.max(0, emails.length - heldEmailsKept));
      logger.info({ event: 'auth.email_held', kind: message.kind });
    },
  };
}
