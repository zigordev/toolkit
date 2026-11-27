'use server';

import { cookies } from 'next/headers';
import { isMode, modeCookie } from '../lib/mode.ts';

const aYear = 60 * 60 * 24 * 365;

export async function setMode(mode: unknown): Promise<void> {
  if (isMode(mode)) {
    (await cookies()).set(modeCookie, mode, {
      path: '/',
      maxAge: aYear,
      sameSite: 'lax',
      httpOnly: true,
    });
  }
}
