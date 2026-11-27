import { expoClient } from '@better-auth/expo/client';
import { twoFactorClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { authNamesOf } from './auth';
import { apiUrl } from './config';
import { withTimeout } from './timeout';

export const authClient = createAuthClient({
  baseURL: apiUrl(),
  basePath: '/api/auth',
  fetchOptions: { customFetchImpl: withTimeout() },
  plugins: [
    expoClient({ ...authNamesOf(Constants.expoConfig?.scheme), storage: SecureStore }),
    twoFactorClient(),
  ],
});
