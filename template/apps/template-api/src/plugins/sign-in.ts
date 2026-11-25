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
import { addToOutbox, type Database } from '@zigordev/events';
import { type EmailRequest, emailRequested } from '@zigordev/notifications-events';
import type { Logger } from '@zigordev/otel';
import { recipientOf, requestIdOf } from './emails.ts';

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

export function authEmailRequest(message: AuthEmail, product: string): EmailRequest {
  const email = emailOf(message, product);
  return {
    to: recipientOf(message.to, message.name),
    subject: email.subject,
    html: email.html,
    text: email.text,
    tags: { template: message.kind, locale: languageOf(message.request) },
  };
}

export interface AuthEmailsOptions {
  readonly db: Database;
  readonly app: string;
  readonly topic: string;
  readonly product: string;
  readonly logger: Logger;
}

export function sendAuthEmails(options: AuthEmailsOptions): AuthEmailSender {
  const { db, app, topic, product, logger } = options;
  return async (message) => {
    const request = await addToOutbox(db, {
      topic,
      event: emailRequested,
      data: authEmailRequest(message, product),
      id: requestIdOf(app, message.idempotencyKey),
    });
    logger.info({ event: 'email.requested', requestId: request.id, template: message.kind });
  };
}
