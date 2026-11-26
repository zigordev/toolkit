import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { chooseLocale, localeCookie } from './locales.ts';
import { messagesOf } from './messages.ts';

export default getRequestConfig(async () => {
  const locale = chooseLocale(
    (await cookies()).get(localeCookie)?.value,
    (await headers()).get('accept-language')
  );
  return { locale, messages: messagesOf(locale) };
});
