import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type GoogleStandIn, startGoogleStandIn, totpCode } from './testing.ts';

let standIn: GoogleStandIn;
const redirectUri = 'http://localhost:3000/api/auth/callback/google';

beforeAll(async () => {
  standIn = await startGoogleStandIn({
    clientId: 'client',
    clientSecret: 'secret',
    host: '127.0.0.1',
    port: 0,
  });
});

afterAll(async () => {
  await standIn.close();
});

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

function authorizeUrl(params: Record<string, string>): string {
  const url = new URL('/o/oauth2/v2/auth', standIn.url);
  for (const [name, value] of Object.entries({
    client_id: 'client',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: 'state-1',
    code_challenge_method: 'S256',
    ...params,
  })) {
    url.searchParams.set(name, value);
  }
  return url.toString();
}

async function authorize(params: Record<string, string>) {
  const response = await fetch(authorizeUrl(params), { redirect: 'manual' });
  const location = response.headers.get('location');
  return { response, back: location === null ? null : new URL(location) };
}

async function token(body: Record<string, string>, headers: Record<string, string> = {}) {
  return fetch(new URL('/token', standIn.url), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(body),
  });
}

function claims(idToken: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8'));
}

describe('the Google stand-in', () => {
  it('refuses an unknown client and asks for an identity before the first sign-in', async () => {
    const unknown = await authorize({ client_id: 'other', code_challenge: pkce().challenge });
    const first = await authorize({ code_challenge: pkce().challenge });

    expect(unknown.response.status).toBe(400);
    expect(first.response.status).toBe(400);
    expect(await first.response.json()).toMatchObject({ error: 'no_identity' });
  });

  it('sends a request without PKCE back with invalid_request', async () => {
    const { back } = await authorize({});

    expect(back?.searchParams.get('error')).toBe('invalid_request');
    expect(back?.searchParams.get('state')).toBe('state-1');
  });

  it('issues a code, then an RS256 ID token for the client, once, and only for the right verifier', async () => {
    standIn.signInAs({ sub: 'sub-1', email: 'ada@example.com', name: 'Ada King Lovelace' });
    const { verifier, challenge } = pkce();
    const { back } = await authorize({ code_challenge: challenge, nonce: 'nonce-1' });
    const code = back?.searchParams.get('code') ?? '';
    expect(back?.origin + (back?.pathname ?? '')).toBe(redirectUri);
    expect(back?.searchParams.get('state')).toBe('state-1');

    const wrong = await token({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: 'not-the-verifier',
      client_id: 'client',
      client_secret: 'secret',
    });
    expect(wrong.status).toBe(400);

    const { back: second } = await authorize({ code_challenge: challenge });
    const response = await token(
      {
        grant_type: 'authorization_code',
        code: second?.searchParams.get('code') ?? '',
        redirect_uri: redirectUri,
        code_verifier: verifier,
      },
      { authorization: `Basic ${Buffer.from('client:secret').toString('base64')}` }
    );
    const body = (await response.json()) as { id_token: string; token_type: string };
    expect(response.status).toBe(200);
    expect(body.token_type).toBe('Bearer');
    const [header] = body.id_token.split('.');
    expect(JSON.parse(Buffer.from(header ?? '', 'base64url').toString('utf8'))).toMatchObject({
      alg: 'RS256',
    });
    expect(claims(body.id_token)).toMatchObject({
      iss: 'https://accounts.google.com',
      aud: 'client',
      sub: 'sub-1',
      email: 'ada@example.com',
      email_verified: true,
      given_name: 'Ada',
      family_name: 'King Lovelace',
    });

    const reused = await token({
      grant_type: 'authorization_code',
      code: second?.searchParams.get('code') ?? '',
      redirect_uri: redirectUri,
      code_verifier: verifier,
      client_id: 'client',
      client_secret: 'secret',
    });
    expect(reused.status).toBe(400);
  });

  it('names an identity without a name after its email, and can mark it unverified', async () => {
    standIn.signInAs({ sub: 'sub-2', email: 'nameless@example.com', emailVerified: false });
    const { verifier, challenge } = pkce();
    const { back } = await authorize({ code_challenge: challenge });

    const response = await token({
      grant_type: 'authorization_code',
      code: back?.searchParams.get('code') ?? '',
      redirect_uri: redirectUri,
      code_verifier: verifier,
      client_id: 'client',
      client_secret: 'secret',
    });
    const body = (await response.json()) as { id_token: string };

    expect(claims(body.id_token)).toMatchObject({
      name: 'nameless@example.com',
      given_name: 'nameless@example.com',
      family_name: '',
      email_verified: false,
      picture: '',
    });
  });

  it('refuses a wrong client secret and answers 404 elsewhere', async () => {
    const response = await token({
      grant_type: 'authorization_code',
      client_id: 'client',
      client_secret: 'nope',
    });
    const missing = await fetch(new URL('/userinfo', standIn.url));

    expect(response.status).toBe(401);
    expect(missing.status).toBe(404);
  });

  it('passes a denial back to the app once', async () => {
    standIn.denyNext('access_denied');
    const denied = await authorize({ code_challenge: pkce().challenge });
    const next = await authorize({ code_challenge: pkce().challenge });

    expect(denied.back?.searchParams.get('error')).toBe('access_denied');
    expect(next.back?.searchParams.get('code')).toBeTruthy();
  });

  it('starts with default credentials on a free port', async () => {
    const other = await startGoogleStandIn();

    expect(other.clientId).toBe('stand-in-client.apps.googleusercontent.com');
    expect(other.clientSecret).toBe('stand-in-secret');
    expect(other.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    await other.close();
  });
});

function base32(bytes: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...bytes].map((byte) => byte.toString(2).padStart(8, '0')).join('');
  let encoded = '';
  for (let index = 0; index < bits.length; index += 5) {
    encoded += alphabet[Number.parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)];
  }
  return encoded;
}

describe('totpCode', () => {
  const secret = base32(Buffer.from('12345678901234567890'));

  it('matches the SHA-1 test vectors of RFC 6238', () => {
    const uri = `otpauth://totp/Example:ada?secret=${secret}&digits=8&period=30`;

    expect(totpCode(uri, 59_000)).toBe('94287082');
    expect(totpCode(uri, 1_111_111_109_000)).toBe('07081804');
  });

  it('ignores base32 padding and defaults to six digits every 30 seconds', () => {
    const padded = `otpauth://totp/Example:ada?secret=${secret}${encodeURIComponent('====')}`;

    expect(totpCode(padded, 59_000)).toBe('287082');
  });
});
