import type { BetterAuthPlugin } from 'better-auth';

export const appOriginHeader = 'expo-origin';

export function appOrigin(): BetterAuthPlugin {
  return {
    id: 'app-origin',
    onRequest: async (request) => {
      const given = request.headers.get(appOriginHeader);
      if (given === null || request.headers.get('origin') !== null) {
        return;
      }
      const headers = new Headers(request.headers);
      headers.set('origin', given);
      return { request: new Request(request, { headers }) };
    },
  };
}
