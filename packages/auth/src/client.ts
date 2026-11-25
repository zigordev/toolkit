import { passkeyClient } from '@better-auth/passkey/client';
import { twoFactorClient } from 'better-auth/client/plugins';
import { createAuthClient as createBetterAuthClient } from 'better-auth/react';

export interface AuthClientOptions {
  readonly baseURL?: string;
  readonly onTwoFactorRedirect?: () => void | Promise<void>;
}

export function createAuthClient(options: AuthClientOptions = {}) {
  return createBetterAuthClient({
    basePath: '/api/auth',
    plugins: [
      passkeyClient(),
      twoFactorClient(
        options.onTwoFactorRedirect === undefined
          ? {}
          : { onTwoFactorRedirect: options.onTwoFactorRedirect }
      ),
    ],
    ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
  });
}

export type AuthClient = ReturnType<typeof createAuthClient>;
