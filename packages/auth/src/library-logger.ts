import type { Logger } from '@zigordev/otel';

export type LibraryLogLevel = 'debug' | 'info' | 'success' | 'warn' | 'error';

export interface MaskedError {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
}

const emailAddress = /[^\s@<>()[\]"',;:]+@[^\s@<>()[\]"',;:]+\.[^\s@<>()[\]"',;:]+/g;

export function maskEmails(text: string): string {
  return text.replace(emailAddress, '[email]');
}

export function maskedError(error: unknown): MaskedError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: maskEmails(error.message),
      ...(error.stack === undefined ? {} : { stack: maskEmails(error.stack) }),
    };
  }
  return { name: 'Error', message: maskEmails(String(error)) };
}

export function libraryLogger(logger: Logger) {
  return {
    level: 'debug' as const,
    log(level: LibraryLogLevel, message: string, ...args: unknown[]): void {
      const cause = args.find((arg): arg is Error => arg instanceof Error);
      const fields = {
        message: maskEmails(message),
        ...(cause === undefined ? {} : { error: maskedError(cause) }),
      };
      if (level === 'error') {
        logger.error({ event: 'auth.library_error', ...fields });
      } else if (level === 'warn') {
        logger.warn({ event: 'auth.library_warning', ...fields });
      } else {
        logger.debug({ event: 'auth.library_debug', ...fields });
      }
    },
  };
}
