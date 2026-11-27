import { describe, expect, it } from 'vitest';
import { authNamesOf } from './auth';

describe('authNamesOf', () => {
  it('uses the scheme, which is the name of the product, for the cookies and the storage too', () => {
    expect(authNamesOf('template')).toEqual({
      scheme: 'template',
      cookiePrefix: 'template',
      storagePrefix: 'template',
    });
  });

  it('takes the first scheme when app.json names several', () => {
    expect(authNamesOf(['notes', 'notes-beta']).scheme).toBe('notes');
  });

  it('refuses an app.json without a scheme', () => {
    expect(() => authNamesOf(undefined)).toThrow(/scheme in app\.json/);
    expect(() => authNamesOf('')).toThrow(/scheme in app\.json/);
    expect(() => authNamesOf([])).toThrow(/scheme in app\.json/);
  });
});
