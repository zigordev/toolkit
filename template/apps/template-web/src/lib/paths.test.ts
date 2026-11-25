import { describe, expect, it } from 'vitest';
import { localPath } from './paths.ts';

describe('localPath', () => {
  it('keeps a path on this site, and sends anything else to the account page', () => {
    expect(localPath('/notes?view=all')).toBe('/notes?view=all');
    expect(localPath('//evil.example/steal')).toBe('/account');
    expect(localPath('https://evil.example')).toBe('/account');
    expect(localPath(undefined)).toBe('/account');
    expect(localPath(undefined, '/')).toBe('/');
  });
});
