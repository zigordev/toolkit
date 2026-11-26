export interface PolicyOptions {
  readonly nonce: string;
  readonly development: boolean;
}

export function newNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}

export function contentSecurityPolicy({ nonce, development }: PolicyOptions): string {
  const scripts = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  const connections = ["'self'"];
  if (development) {
    scripts.push("'unsafe-eval'");
    connections.push('ws:');
  }
  return [
    "default-src 'self'",
    `script-src ${scripts.join(' ')}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self'",
    "font-src 'self'",
    `connect-src ${connections.join(' ')}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}
