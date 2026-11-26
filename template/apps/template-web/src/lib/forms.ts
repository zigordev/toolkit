import type { FieldErrors, FieldValues, Resolver } from 'react-hook-form';
import * as z from 'zod';

z.config({ jitless: true });

export const passwordLength = { shortest: 15, longest: 128 } as const;

export type FieldProblem = 'required' | 'email' | 'too-short' | 'too-long';

const filled = z.string().trim().min(1, { error: 'required' });
const email = filled.pipe(z.email({ error: 'email' }));
const password = z.string().min(1, { error: 'required' });

export const signInFields = z.object({ email, password });
export const signUpFields = z.object({
  name: filled,
  email,
  password: password
    .min(passwordLength.shortest, { error: 'too-short' })
    .max(passwordLength.longest, { error: 'too-long' }),
});
export const codeFields = z.object({ code: filled, trust: z.boolean() });
export const passkeyFields = z.object({ name: filled });
export const passwordFields = z.object({ password });
export const confirmFields = z.object({ code: filled });

export type SignInValues = z.output<typeof signInFields>;
export type SignUpValues = z.output<typeof signUpFields>;
export type CodeValues = z.output<typeof codeFields>;
export type PasskeyValues = z.output<typeof passkeyFields>;
export type PasswordValues = z.output<typeof passwordFields>;
export type ConfirmValues = z.output<typeof confirmFields>;

export function zodResolver<Input extends FieldValues, Output extends FieldValues>(
  schema: z.ZodType<Output, Input>
): Resolver<Input, unknown, Output> {
  return async (values) => {
    const result = await schema.safeParseAsync(values);
    if (result.success) {
      return { values: result.data, errors: {} };
    }
    const errors: Record<string, { type: string; message: string }> = {};
    for (const issue of result.error.issues) {
      errors[issue.path.join('.')] ??= { type: issue.code, message: issue.message };
    }
    return { values: {}, errors: errors as FieldErrors<Input> };
  };
}
