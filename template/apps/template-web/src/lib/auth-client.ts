import { type AuthClient, createAuthClient } from '@zigordev/auth/client';

let client: AuthClient | undefined;

export function getAuthClient(): AuthClient {
  client ??= createAuthClient({
    onTwoFactorRedirect: () => {
      window.location.assign('/two-factor');
    },
  });
  return client;
}
