export interface AuthNames {
  readonly scheme: string;
  readonly cookiePrefix: string;
  readonly storagePrefix: string;
}

export function authNamesOf(scheme: string | readonly string[] | undefined): AuthNames {
  const name = typeof scheme === 'string' ? scheme : scheme?.[0];
  if (name === undefined || name === '') {
    throw new Error('Sign-in needs the scheme in app.json, which is the name of the product');
  }
  return { scheme: name, cookiePrefix: name, storagePrefix: name };
}
