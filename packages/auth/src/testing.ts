import { createHash, createHmac, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { googleAuthorizationPath, googleTokenPath } from './google.ts';

export interface GoogleIdentity {
  readonly sub: string;
  readonly email: string;
  readonly emailVerified?: boolean;
  readonly name?: string;
  readonly picture?: string;
}

export interface GoogleStandInOptions {
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly host?: string;
  readonly port?: number;
}

export interface GoogleStandIn {
  readonly url: string;
  readonly clientId: string;
  readonly clientSecret: string;
  signInAs(identity: GoogleIdentity): void;
  denyNext(error?: string): void;
  close(): Promise<void>;
}

interface Grant {
  readonly redirectUri: string;
  readonly codeChallenge: string;
  readonly scope: string;
  readonly nonce: string | null;
  readonly identity: GoogleIdentity;
}

const issuer = 'https://accounts.google.com';

function base64url(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}

function redirectTo(response: ServerResponse, target: string, params: Record<string, string>) {
  const url = new URL(target);
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }
  response.writeHead(302, { location: url.toString() });
  response.end();
}

function clientCredentials(request: IncomingMessage, form: URLSearchParams) {
  const header = request.headers.authorization;
  if (header?.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    return {
      id: decodeURIComponent(decoded.slice(0, separator)),
      secret: decodeURIComponent(decoded.slice(separator + 1)),
    };
  }
  return { id: String(form.get('client_id')), secret: String(form.get('client_secret')) };
}

export async function startGoogleStandIn(
  options: GoogleStandInOptions = {}
): Promise<GoogleStandIn> {
  const clientId = options.clientId ?? 'stand-in-client.apps.googleusercontent.com';
  const clientSecret = options.clientSecret ?? 'stand-in-secret';
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const keyId = base64url(randomBytes(8));
  const grants = new Map<string, Grant>();
  let identity: GoogleIdentity | undefined;
  let denial: string | undefined;

  function idToken(grant: Grant): string {
    const now = Math.floor(Date.now() / 1000);
    const name = grant.identity.name ?? grant.identity.email;
    const words = name.split(' ');
    const header = { alg: 'RS256', kid: keyId, typ: 'JWT' };
    const payload = {
      iss: issuer,
      azp: clientId,
      aud: clientId,
      sub: grant.identity.sub,
      email: grant.identity.email,
      email_verified: grant.identity.emailVerified ?? true,
      name,
      given_name: words.slice(0, 1).join(' '),
      family_name: words.slice(1).join(' '),
      picture: grant.identity.picture ?? '',
      iat: now,
      exp: now + 3600,
      ...(grant.nonce === null ? {} : { nonce: grant.nonce }),
    };
    const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
    return `${signingInput}.${base64url(sign('RSA-SHA256', Buffer.from(signingInput), privateKey))}`;
  }

  function authorize(url: URL, response: ServerResponse): void {
    const query = url.searchParams;
    const redirectUri = query.get('redirect_uri');
    const state = query.get('state') ?? '';
    const codeChallenge = query.get('code_challenge');
    const scope = query.get('scope') ?? '';
    if (query.get('client_id') !== clientId || redirectUri === null || !URL.canParse(redirectUri)) {
      sendJson(response, 400, {
        error: 'invalid_request',
        error_description: 'unknown client or redirect',
      });
      return;
    }
    if (
      query.get('response_type') !== 'code' ||
      query.get('code_challenge_method') !== 'S256' ||
      codeChallenge === null ||
      !scope.split(' ').includes('openid')
    ) {
      redirectTo(response, redirectUri, { error: 'invalid_request', state });
      return;
    }
    if (denial !== undefined) {
      const error = denial;
      denial = undefined;
      redirectTo(response, redirectUri, { error, state });
      return;
    }
    if (identity === undefined) {
      sendJson(response, 400, { error: 'no_identity', error_description: 'call signInAs first' });
      return;
    }
    const code = base64url(randomBytes(24));
    grants.set(code, { redirectUri, codeChallenge, scope, nonce: query.get('nonce'), identity });
    redirectTo(response, redirectUri, { code, state });
  }

  async function token(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const form = new URLSearchParams(await readBody(request));
    const client = clientCredentials(request, form);
    if (client.id !== clientId || client.secret !== clientSecret) {
      sendJson(response, 401, { error: 'invalid_client' });
      return;
    }
    const code = String(form.get('code'));
    const grant = grants.get(code);
    grants.delete(code);
    const verifier = String(form.get('code_verifier'));
    const challenge = base64url(createHash('sha256').update(verifier).digest());
    if (
      form.get('grant_type') !== 'authorization_code' ||
      grant === undefined ||
      grant.redirectUri !== form.get('redirect_uri') ||
      grant.codeChallenge !== challenge
    ) {
      sendJson(response, 400, { error: 'invalid_grant' });
      return;
    }
    sendJson(response, 200, {
      access_token: base64url(randomBytes(24)),
      expires_in: 3599,
      scope: grant.scope,
      token_type: 'Bearer',
      id_token: idToken(grant),
    });
  }

  const server = createServer((request, response) => {
    const url = new URL(String(request.url), 'http://stand-in');
    if (request.method === 'GET' && url.pathname === googleAuthorizationPath) {
      authorize(url, response);
      return;
    }
    if (request.method === 'POST' && url.pathname === googleTokenPath) {
      token(request, response).catch(() => sendJson(response, 500, { error: 'server_error' }));
      return;
    }
    sendJson(response, 404, { error: 'not_found' });
  });
  const host = options.host ?? '127.0.0.1';
  await new Promise<void>((resolve) => {
    server.listen(options.port ?? 0, host, resolve);
  });
  const address = server.address() as AddressInfo;

  return {
    url: `http://${host}:${address.port}`,
    clientId,
    clientSecret,
    signInAs(next) {
      identity = next;
    },
    denyNext(error = 'access_denied') {
      denial = error;
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}

type CborValue = number | string | Uint8Array | ReadonlyMap<CborValue, CborValue>;

function cborHead(major: number, length: number): Buffer {
  if (length < 24) {
    return Buffer.from([(major << 5) | length]);
  }
  if (length < 0x100) {
    return Buffer.from([(major << 5) | 24, length]);
  }
  const head = Buffer.alloc(3);
  head.writeUInt8((major << 5) | 25, 0);
  head.writeUInt16BE(length, 1);
  return head;
}

function encodeCbor(value: CborValue): Buffer {
  if (typeof value === 'number') {
    return value >= 0 ? cborHead(0, value) : cborHead(1, -1 - value);
  }
  if (typeof value === 'string') {
    const bytes = Buffer.from(value, 'utf8');
    return Buffer.concat([cborHead(3, bytes.length), bytes]);
  }
  if (value instanceof Uint8Array) {
    return Buffer.concat([cborHead(2, value.length), value]);
  }
  const parts = [cborHead(5, value.size)];
  for (const [key, item] of value) {
    parts.push(encodeCbor(key), encodeCbor(item));
  }
  return Buffer.concat(parts);
}

export interface PasskeyCreationOptions {
  readonly challenge: string;
  readonly rp: { readonly id?: string | undefined };
  readonly user: { readonly id: string };
}

export interface PasskeyRequestOptions {
  readonly challenge: string;
  readonly rpId?: string | undefined;
}

export interface PasskeyRegistration {
  readonly id: string;
  readonly rawId: string;
  readonly type: 'public-key';
  readonly authenticatorAttachment: 'platform';
  readonly clientExtensionResults: Record<string, never>;
  readonly response: {
    readonly clientDataJSON: string;
    readonly attestationObject: string;
    readonly transports: readonly string[];
  };
}

export interface PasskeyAssertion {
  readonly id: string;
  readonly rawId: string;
  readonly type: 'public-key';
  readonly authenticatorAttachment: 'platform';
  readonly clientExtensionResults: Record<string, never>;
  readonly response: {
    readonly clientDataJSON: string;
    readonly authenticatorData: string;
    readonly signature: string;
    readonly userHandle: string;
  };
}

export interface SoftwarePasskey {
  readonly credentialId: string;
  register(options: PasskeyCreationOptions, origin: string): PasskeyRegistration;
  assert(options: PasskeyRequestOptions, origin: string): PasskeyAssertion;
}

const userPresent = 0x01;
const userVerified = 0x04;
const attestedCredential = 0x40;

function rpIdHash(rpId: string | undefined, origin: string): Buffer {
  return createHash('sha256')
    .update(rpId ?? new URL(origin).hostname)
    .digest();
}

function clientData(type: string, challenge: string, origin: string): Buffer {
  return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
}

export function createSoftwarePasskey(): SoftwarePasskey {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const credential = randomBytes(32);
  const credentialId = base64url(credential);
  let userHandle = '';
  let signCount = 0;

  const coseKey = encodeCbor(
    new Map<CborValue, CborValue>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, Buffer.from(String(jwk.x), 'base64url')],
      [-3, Buffer.from(String(jwk.y), 'base64url')],
    ])
  );

  return {
    credentialId,
    register(options, origin) {
      userHandle = options.user.id;
      const length = Buffer.alloc(2);
      length.writeUInt16BE(credential.length, 0);
      const authData = Buffer.concat([
        rpIdHash(options.rp.id, origin),
        Buffer.from([userPresent | userVerified | attestedCredential]),
        Buffer.alloc(4),
        Buffer.alloc(16),
        length,
        credential,
        coseKey,
      ]);
      const attestationObject = encodeCbor(
        new Map<CborValue, CborValue>([
          ['fmt', 'none'],
          ['attStmt', new Map()],
          ['authData', authData],
        ])
      );
      return {
        id: credentialId,
        rawId: credentialId,
        type: 'public-key',
        authenticatorAttachment: 'platform',
        clientExtensionResults: {},
        response: {
          clientDataJSON: base64url(clientData('webauthn.create', options.challenge, origin)),
          attestationObject: base64url(attestationObject),
          transports: ['internal'],
        },
      };
    },
    assert(options, origin) {
      signCount += 1;
      const counter = Buffer.alloc(4);
      counter.writeUInt32BE(signCount, 0);
      const authenticatorData = Buffer.concat([
        rpIdHash(options.rpId, origin),
        Buffer.from([userPresent | userVerified]),
        counter,
      ]);
      const data = clientData('webauthn.get', options.challenge, origin);
      const signed = Buffer.concat([authenticatorData, createHash('sha256').update(data).digest()]);
      return {
        id: credentialId,
        rawId: credentialId,
        type: 'public-key',
        authenticatorAttachment: 'platform',
        clientExtensionResults: {},
        response: {
          clientDataJSON: base64url(data),
          authenticatorData: base64url(authenticatorData),
          signature: base64url(sign('sha256', signed, privateKey)),
          userHandle,
        },
      };
    },
  };
}

const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function decodeBase32(text: string): Buffer {
  let bits = '';
  for (const character of text.toUpperCase()) {
    if (character === '=') {
      break;
    }
    bits += base32Alphabet.indexOf(character).toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

export function totpCode(totpUri: string, at: number = Date.now()): string {
  const params = new URL(totpUri).searchParams;
  const digits = Number(params.get('digits') ?? 6);
  const period = Number(params.get('period') ?? 30);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / period)), 0);
  const hmac = createHmac('sha1', decodeBase32(String(params.get('secret'))))
    .update(counter)
    .digest();
  const offset = (hmac.at(-1) ?? 0) & 0x0f;
  const value = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 10 ** digits).padStart(digits, '0');
}
