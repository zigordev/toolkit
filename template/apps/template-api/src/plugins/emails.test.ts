import { createEnvelope, type Database, type HandleContext } from '@zigordev/events';
import { emailFailed, emailSent } from '@zigordev/notifications-events';
import { createLogger } from '@zigordev/otel';
import { captureLogs } from '@zigordev/test/app';
import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import { emailOutcomes, emailTopicsOf, recipientOf, requestIdOf } from './emails.ts';

describe('emailTopicsOf', () => {
  it('names the topics of the app and the group that reads its outcomes', () => {
    expect(emailTopicsOf('template-api')).toEqual({
      requests: 'notifications.requests.template-api',
      outcomes: 'notifications.outcomes.template-api',
      outcomesGroup: 'template-api.email-outcomes',
    });
  });
});

describe('requestIdOf', () => {
  it('gives one UUID for one key of one app, and another for any other', () => {
    const id = requestIdOf('template-api', 'auth-verify-email-abc');

    expect(z.uuid().safeParse(id).success).toBe(true);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(requestIdOf('template-api', 'auth-verify-email-abc')).toBe(id);
    expect(requestIdOf('template-api', 'auth-verify-email-abd')).not.toBe(id);
    expect(requestIdOf('playground-api', 'auth-verify-email-abc')).not.toBe(id);
  });
});

describe('recipientOf', () => {
  it('keeps the name when an address header can carry it, and the address alone when not', () => {
    expect(recipientOf('ada@example.com', '  Ada Lovelace ')).toEqual({
      email: 'ada@example.com',
      name: 'Ada Lovelace',
    });
    expect(recipientOf('ada@example.com', 'Ada\r\nBcc: eve@example.com')).toEqual({
      email: 'ada@example.com',
    });
  });
});

describe('emailOutcomes', () => {
  const topics = emailTopicsOf('template-api');
  const context: HandleContext = {
    tx: {} as Database,
    topic: topics.outcomes,
    partition: 0,
    offset: 0n,
    attempt: 1,
  };
  const requestId = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

  it('reads the outcome topic of the app, in a group of its own', () => {
    const consumer = emailOutcomes({ topics, logger: createLogger({ service: 'test' }) });

    expect(consumer.group).toBe('template-api.email-outcomes');
    expect(consumer.topics).toEqual(['notifications.outcomes.template-api']);
    expect(consumer.events.map((event) => event.type)).toEqual(['email.sent', 'email.failed']);
  });

  it('logs a sent email as information, and a failed one as a warning with its reason', async () => {
    const logs = captureLogs();
    const consumer = emailOutcomes({
      topics,
      logger: createLogger({ service: 'test', destination: logs }),
    });

    await consumer.handle(
      createEnvelope(emailSent, { requestId, sentAt: '2026-11-25T20:00:00.000Z', attempts: 1 }),
      context
    );
    await consumer.handle(
      createEnvelope(emailFailed, {
        requestId,
        failedAt: '2026-11-25T20:00:00.000Z',
        attempts: 1,
        reason: 'rejected',
        smtpCode: 550,
      }),
      context
    );

    expect(logs.find('email.sent')).toEqual([
      expect.objectContaining({ level: 'info', requestId, attempts: 1 }),
    ]);
    expect(logs.find('email.failed')).toEqual([
      expect.objectContaining({
        level: 'warn',
        requestId,
        attempts: 1,
        reason: 'rejected',
        smtpCode: 550,
      }),
    ]);
  });
});
