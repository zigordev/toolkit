'use server';

import { cookies } from 'next/headers';
import { isLocale, localeCookie } from '../i18n/locales.ts';

const aYear = 60 * 60 * 24 * 365;

export async function chooseLanguage(form: FormData): Promise<void> {
  const locale = form.get('locale');
  if (isLocale(locale)) {
    (await cookies()).set(localeCookie, locale, {
      path: '/',
      maxAge: aYear,
      sameSite: 'lax',
      httpOnly: true,
    });
  }
}
