import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, newNonce } from './csp.ts';

describe('the content security policy', () => {
  it('lets in only scripts and styles that carry the nonce, and only this origin', () => {
    expect(contentSecurityPolicy({ nonce: 'abc', development: false })).toBe(
      [
        "default-src 'self'",
        "script-src 'self' 'nonce-abc' 'strict-dynamic'",
        "style-src 'self' 'nonce-abc'",
        "img-src 'self'",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join('; ')
    );
  });

  it('allows what the dev server needs, and only on this Mac', () => {
    const policy = contentSecurityPolicy({ nonce: 'abc', development: true });

    expect(policy).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic' 'unsafe-eval'");
    expect(policy).toContain("connect-src 'self' ws:");
  });
});

describe('newNonce', () => {
  it('is 16 random bytes in base64, new each time', () => {
    const first = newNonce();

    expect(first).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(newNonce()).not.toBe(first);
  });
});
