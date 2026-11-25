import * as z from 'zod';

export type AuthMethod = 'email' | 'google' | 'passkey';

export const authMethods: readonly AuthMethod[] = ['email', 'google', 'passkey'];

const httpUrl = z.url({ protocol: /^https?$/ });

const origin = httpUrl.refine((value) => {
  const url = new URL(value);
  return url.pathname === '/' && url.search === '' && url.hash === '';
}, 'must be an origin such as https://app.example.com, with no path');

export function authConfigShape(methods: readonly AuthMethod[]) {
  const google = methods.includes('google');
  const required = z.string().min(1);
  return {
    AUTH_SECRET: z.string().min(32, 'must be at least 32 characters'),
    AUTH_URL: origin,
    AUTH_GOOGLE_CLIENT_ID: google ? required : required.optional(),
    AUTH_GOOGLE_CLIENT_SECRET: google ? required : required.optional(),
    AUTH_GOOGLE_STAND_IN_URL: origin.optional(),
  };
}

export interface AuthConfig {
  readonly AUTH_SECRET: string;
  readonly AUTH_URL: string;
  readonly AUTH_GOOGLE_CLIENT_ID?: string | undefined;
  readonly AUTH_GOOGLE_CLIENT_SECRET?: string | undefined;
  readonly AUTH_GOOGLE_STAND_IN_URL?: string | undefined;
}
