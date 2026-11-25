import { createLogger } from '@zigordev/otel';
import { describe, expect, it } from 'vitest';
import { libraryLogger, maskEmails, maskedError } from './library-logger.ts';

function setup() {
  const records: Record<string, unknown>[] = [];
  const stream = { write: (line: string) => records.push(JSON.parse(line)) };
  const logger = createLogger({
    service: 'toolkit-auth-test',
    level: 'debug',
    destination: stream,
  });
  return { records, log: libraryLogger(logger) };
}

describe('maskEmails', () => {
  it('replaces every email address and leaves the rest', () => {
    expect(maskEmails('Sign-up attempt for existing email: Ada.L+pools@Example.co.uk')).toBe(
      'Sign-up attempt for existing email: [email]'
    );
    expect(maskEmails('Key (email)=(a@b.io) already exists, see <x@y.dev>')).toBe(
      'Key (email)=([email]) already exists, see <[email]>'
    );
    expect(maskEmails('Invalid origin: https://evil.example.net')).toBe(
      'Invalid origin: https://evil.example.net'
    );
  });
});

describe('maskedError', () => {
  it('keeps the name, and masks the message and the stack', () => {
    const error = new TypeError('no user ada@example.com');

    const masked = maskedError(error);

    expect(masked.name).toBe('TypeError');
    expect(masked.message).toBe('no user [email]');
    expect(masked.stack).not.toMatch(/ada@example\.com/);
  });

  it('leaves the stack out when the error has none', () => {
    const error = new Error('no stack');
    error.stack = undefined;

    expect(maskedError(error)).toEqual({ name: 'Error', message: 'no stack' });
  });

  it('describes a thrown value that is not an Error', () => {
    expect(maskedError('failed for ada@example.com')).toEqual({
      name: 'Error',
      message: 'failed for [email]',
    });
  });
});

describe('libraryLogger', () => {
  it('maps Better Auth levels onto events and drops arguments that are not errors', () => {
    const { records, log } = setup();

    log.log('error', 'Failed to create user', new Error('dup ada@example.com'), {
      email: 'ada@example.com',
    });
    log.log('warn', 'Reset Password: User not found');
    log.log('info', 'Sign-up attempt for existing email: ada@example.com');
    log.log('success', 'done');
    log.log('debug', 'detail');

    expect(log.level).toBe('debug');
    expect(records.map((record) => [record.level, record.event])).toEqual([
      ['error', 'auth.library_error'],
      ['warn', 'auth.library_warning'],
      ['debug', 'auth.library_debug'],
      ['debug', 'auth.library_debug'],
      ['debug', 'auth.library_debug'],
    ]);
    expect(records[0]).toMatchObject({
      message: 'Failed to create user',
      error: { message: 'dup [email]' },
    });
    expect(JSON.stringify(records)).not.toMatch(/ada@example\.com/);
  });
});
