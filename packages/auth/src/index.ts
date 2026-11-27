export type { AuthConfig, AuthMethod } from './config.ts';
export { authConfigShape, authMethods } from './config.ts';
export type {
  AppAuth,
  Authentication,
  BetterAuthInstance,
  CreateAuthOptions,
} from './create-auth.ts';
export {
  appOrigins,
  authBasePath,
  createAuth,
  linkLifetimeSeconds,
  passwordLength,
  sessionLifetime,
  trustedDeviceSeconds,
} from './create-auth.ts';
export type {
  AccountExistsMessage,
  AuthEmail,
  AuthEmailKind,
  AuthEmailSender,
  DeleteAccountMessage,
  ResetPasswordMessage,
  VerifyEmailMessage,
} from './emails.ts';
export { authEmailKinds } from './emails.ts';
export type { AuthSession, AuthSessionDetails, AuthUser } from './session.ts';
export { parseSession } from './session.ts';
