import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { config, proxy } from './proxy.ts';

afterEach(() => {
  vi.unstubAllEnvs();
});

function policyOf(headers: Headers, name: string): string {
  return headers.get(name) ?? '';
}

describe('the proxy', () => {
  it('gives each page a policy with a fresh nonce, and hands the same policy to Next.js', () => {
    const first = proxy(new NextRequest('http://template.localhost/sign-in'));
    const second = proxy(new NextRequest('http://template.localhost/sign-in'));

    const policy = policyOf(first.headers, 'content-security-policy');
    expect(policy).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(policyOf(first.headers, 'x-middleware-request-content-security-policy')).toBe(policy);
    expect(policyOf(second.headers, 'content-security-policy')).not.toBe(policy);
    expect(policy).not.toContain('unsafe-eval');
  });

  it("allows the dev server's needs under next dev", () => {
    vi.stubEnv('NODE_ENV', 'development');

    const response = proxy(new NextRequest('http://localhost:3001/'));

    expect(policyOf(response.headers, 'content-security-policy')).toContain("'unsafe-eval'");
  });

  it('leaves out the API, the static files and the health route', () => {
    const source = config.matcher[0]?.source ?? '';
    const covered = (path: string) => new RegExp(`^${source}$`).test(path);

    expect(covered('/')).toBe(true);
    expect(covered('/sign-in')).toBe(true);
    expect(covered('/api/auth/get-session')).toBe(false);
    expect(covered('/_next/static/chunks/a.js')).toBe(false);
    expect(covered('/health')).toBe(false);
  });
});
