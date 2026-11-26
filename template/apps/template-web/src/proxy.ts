import { type NextRequest, NextResponse } from 'next/server';
import { contentSecurityPolicy, newNonce } from './lib/csp.ts';

const policyHeader = 'content-security-policy';

export function proxy(request: NextRequest): NextResponse {
  const policy = contentSecurityPolicy({
    nonce: newNonce(),
    development: process.env.NODE_ENV === 'development',
  });
  const headers = new Headers(request.headers);
  headers.set(policyHeader, policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set(policyHeader, policy);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api/|_next/static|_next/image|health$|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
