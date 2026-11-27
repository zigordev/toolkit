import { createNextAuth, type NextAuth } from '@zigordev/auth/next';
import { getConfig } from './config.ts';
import { getLogger } from './logger.ts';

let nextAuth: NextAuth | undefined;

export function getNextAuth(): NextAuth {
  nextAuth ??= createNextAuth({
    apiUrl: getConfig().API_URL,
    signInPath: '/sign-in',
    logger: getLogger(),
  });
  return nextAuth;
}

export async function signedInUser() {
  try {
    return await getNextAuth().getUser();
  } catch (error) {
    getLogger().warn({ event: 'api.unreachable', error });
    return null;
  }
}
