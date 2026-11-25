import * as z from 'zod';

const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  emailVerified: z.boolean(),
  image: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

const sessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  expiresAt: z.coerce.date(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

const authSessionSchema = z.object({ user: userSchema, session: sessionSchema }).nullable();

export type AuthUser = Readonly<z.output<typeof userSchema>>;
export type AuthSessionDetails = Readonly<z.output<typeof sessionSchema>>;

export interface AuthSession {
  readonly user: AuthUser;
  readonly session: AuthSessionDetails;
}

export function parseSession(value: unknown): AuthSession | null {
  return authSessionSchema.parse(value ?? null);
}
