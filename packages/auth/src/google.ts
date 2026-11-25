import type { BetterAuthPlugin } from 'better-auth';
import {
  type OAuthProvider,
  type ProviderOptions,
  validateAuthorizationCode,
} from 'better-auth/oauth2';

export const googleAuthorizationPath = '/o/oauth2/v2/auth';
export const googleTokenPath = '/token';

export interface GoogleStandInSettings {
  readonly url: string;
  readonly clientId: string;
  readonly clientSecret: string;
}

function pointAtStandIn(provider: OAuthProvider, settings: GoogleStandInSettings): OAuthProvider {
  const authorizationEndpoint = new URL(googleAuthorizationPath, settings.url);
  const tokenEndpoint = new URL(googleTokenPath, settings.url).toString();
  const options: ProviderOptions = {
    clientId: settings.clientId,
    clientSecret: settings.clientSecret,
  };
  return {
    ...provider,
    async createAuthorizationURL(input) {
      const google = await provider.createAuthorizationURL(input);
      const standIn = new URL(authorizationEndpoint);
      standIn.search = google.search;
      return standIn;
    },
    validateAuthorizationCode: (input) =>
      validateAuthorizationCode({ ...input, options, tokenEndpoint }),
  };
}

export function withGoogleStandIn(
  providers: readonly OAuthProvider[],
  settings: GoogleStandInSettings
): OAuthProvider[] {
  return providers.map((provider) =>
    provider.id === 'google' ? pointAtStandIn(provider, settings) : provider
  );
}

export function googleStandIn(settings: GoogleStandInSettings): BetterAuthPlugin {
  return {
    id: 'google-stand-in',
    init(context) {
      return { context: { socialProviders: withGoogleStandIn(context.socialProviders, settings) } };
    },
  };
}
