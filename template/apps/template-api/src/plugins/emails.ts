import { createHash } from 'node:crypto';
import { type ConsumerDefinition, defineConsumer } from '@zigordev/events';
import {
  type Mailbox,
  mailboxSchema,
  outcomeEvents,
  outcomeTopicOf,
  requestTopicOf,
} from '@zigordev/notifications-events';
import type { Logger } from '@zigordev/otel';

export interface EmailTopics {
  readonly requests: string;
  readonly outcomes: string;
  readonly outcomesGroup: string;
}

export function emailTopicsOf(app: string): EmailTopics {
  return {
    requests: requestTopicOf(app),
    outcomes: outcomeTopicOf(app),
    outcomesGroup: `${app}.email-outcomes`,
  };
}

export function requestIdOf(app: string, key: string): string {
  const bytes = createHash('sha256').update(`${app}\n${key}`).digest().subarray(0, 16);
  bytes.writeUInt8(0x80 | (bytes.readUInt8(6) & 0x0f), 6);
  bytes.writeUInt8(0x80 | (bytes.readUInt8(8) & 0x3f), 8);
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

export function recipientOf(email: string, name: string): Mailbox {
  const named = mailboxSchema.safeParse({ email, name });
  return named.success ? named.data : { email };
}

export interface EmailOutcomesOptions {
  readonly topics: EmailTopics;
  readonly logger: Logger;
}

export function emailOutcomes(options: EmailOutcomesOptions): ConsumerDefinition {
  const { topics, logger } = options;
  return defineConsumer({
    group: topics.outcomesGroup,
    topics: [topics.outcomes],
    events: outcomeEvents,
    handle: async (event) => {
      if (event.type === 'email.sent') {
        logger.info({
          event: 'email.sent',
          requestId: event.data.requestId,
          attempts: event.data.attempts,
        });
        return;
      }
      logger.warn({
        event: 'email.failed',
        requestId: event.data.requestId,
        attempts: event.data.attempts,
        reason: event.data.reason,
        smtpCode: event.data.smtpCode,
      });
    },
  });
}
