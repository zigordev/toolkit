export { codeFields, signInFields } from '../../template-web/src/lib/forms';

interface Issue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

type Parsed<Values> =
  | { readonly success: true; readonly data: Values }
  | { readonly success: false; readonly error: { readonly issues: readonly Issue[] } };

export interface Schema<Values> {
  safeParse(input: unknown): Parsed<Values>;
}

export interface Checked<Values> {
  readonly values: Values | null;
  readonly problems: Readonly<Record<string, string>>;
}

export function check<Values>(schema: Schema<Values>, input: unknown): Checked<Values> {
  const result = schema.safeParse(input);
  if (result.success) {
    return { values: result.data, problems: {} };
  }
  const problems: Record<string, string> = {};
  for (const issue of result.error.issues) {
    problems[issue.path.map(String).join('.')] ??= issue.message;
  }
  return { values: null, problems };
}
