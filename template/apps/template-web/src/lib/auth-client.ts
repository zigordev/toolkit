import { type AuthClient, createAuthClient } from '@zigordev/auth/client';
import { go } from './navigate.ts';

let client: AuthClient | undefined;

export function getAuthClient(): AuthClient {
  client ??= createAuthClient({
    onTwoFactorRedirect: () => {
      go('/two-factor');
    },
  });
  return client;
}
