import { describe, expect, it } from 'vitest';
import { apiUrl, defaultApiUrl } from './config';

describe('apiUrl', () => {
  it('takes the address the build was given, without a trailing slash', () => {
    expect(apiUrl('https://notes.zigordev.com/')).toBe('https://notes.zigordev.com');
  });

  it('falls back to the API on this Mac when the build was given none', () => {
    expect(apiUrl(undefined)).toBe(defaultApiUrl);
    expect(apiUrl('  ')).toBe(defaultApiUrl);
  });

  it('reads EXPO_PUBLIC_API_URL when it is called with nothing', () => {
    const before = process.env.EXPO_PUBLIC_API_URL;
    process.env.EXPO_PUBLIC_API_URL = 'http://10.0.2.2:3000';
    try {
      expect(apiUrl()).toBe('http://10.0.2.2:3000');
    } finally {
      if (before === undefined) {
        delete process.env.EXPO_PUBLIC_API_URL;
      } else {
        process.env.EXPO_PUBLIC_API_URL = before;
      }
    }
  });
});
