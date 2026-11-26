import { afterEach, vi } from 'vitest';
import { testLocale } from './test/locale.ts';

vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl');
  const { messagesOf } = await import('./src/i18n/messages.ts');
  const translator = (namespace?: string) =>
    createTranslator({
      locale: testLocale.current,
      messages: messagesOf(testLocale.current),
      ...(namespace === undefined ? {} : { namespace }),
    } as Parameters<typeof createTranslator>[0]);
  return {
    getLocale: async () => testLocale.current,
    getMessages: async () => messagesOf(testLocale.current),
    getTranslations: async (namespace?: string) => translator(namespace),
    getRequestConfig: <T>(make: T) => make,
  };
});

afterEach(() => {
  testLocale.current = 'en';
});
