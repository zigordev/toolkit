import { spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

interface Person {
  readonly name: string;
  readonly email: string;
  readonly password: string;
}

interface Answer {
  readonly body: Record<string, unknown>;
  readonly cookies: string;
}

const apiUrl = process.env.API_URL ?? 'http://127.0.0.1:3000';
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://template_api:local-only@127.0.0.1:5433/template_api';
const origin = new URL(process.env.AUTH_URL ?? 'http://localhost:3001').origin;
const domain = 'screens.example';
const thisMachine = new Set(['127.0.0.1', 'localhost', '[::1]']);

function onThisMachine(url: string, what: string): void {
  if (!thisMachine.has(new URL(url).hostname)) {
    throw new Error(`The screen tests delete accounts, so ${what} has to run on this machine`);
  }
}

function person(name: string, handle: string): Person {
  return {
    name,
    email: `${handle}@${domain}`,
    password: `screens-${randomBytes(12).toString('base64url')}`,
  };
}

async function post(path: string, body: unknown, cookies = ''): Promise<Answer> {
  const response = await fetch(new URL(path, apiUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
      ...(cookies ? { cookie: cookies } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${path} answered ${response.status}`);
  }
  const set = response.headers.getSetCookie().map((line) => line.split(';')[0]);
  return { body: (await response.json()) as Record<string, unknown>, cookies: set.join('; ') };
}

function base32(text: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...text.replace(/=+$/, '').toUpperCase()]
    .map((character) => alphabet.indexOf(character).toString(2).padStart(5, '0'))
    .join('');
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(secret: string): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac('sha1', base32(secret)).update(counter).digest();
  const offset = (digest.at(-1) ?? 0) & 0xf;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

async function signIn(who: Person): Promise<string> {
  return (await post('/api/auth/sign-in/email', { email: who.email, password: who.password }))
    .cookies;
}

async function turnOnTwoFactor(who: Person): Promise<string> {
  const cookies = await signIn(who);
  const { body } = await post('/api/auth/two-factor/enable', { password: who.password }, cookies);
  const secret = new URL(String(body.totpURI)).searchParams.get('secret') ?? '';
  await post('/api/auth/two-factor/verify-totp', { code: totp(secret) }, cookies);
  const [code] = body.backupCodes as string[];
  return code ?? '';
}

async function writeNotes(who: Person, count: number): Promise<void> {
  const cookies = await signIn(who);
  for (let index = 1; index <= count; index += 1) {
    const title = `Note ${String(index).padStart(2, '0')}`;
    await post('/api/v1/notes', { title, status: index % 5 === 0 ? 'done' : 'open' }, cookies);
  }
}

onThisMachine(apiUrl, 'the API');
onThisMachine(databaseUrl, 'the database');

const plain = person('Ada Lovelace', 'ada');
const guarded = person('Grace Hopper', 'grace');
const listed = person('Mary Somerville', 'mary');

const db = new pg.Client({ connectionString: databaseUrl });
await db.connect();
try {
  await db.query('DELETE FROM users WHERE email LIKE $1', [`%@${domain}`]);
  for (const who of [plain, guarded, listed]) {
    await post('/api/auth/sign-up/email', who);
  }
  await db.query('UPDATE users SET email_verified = true WHERE email LIKE $1', [`%@${domain}`]);
} finally {
  await db.end();
}
const backupCode = await turnOnTwoFactor(guarded);
await writeNotes(listed, 21);

const flows = fileURLToPath(new URL('flows', import.meta.url));
const given = process.argv.slice(2);
const options = given[0] === '--' ? given.slice(1) : given;
const maestro = spawn('maestro', ['test', ...options, flows], {
  stdio: 'inherit',
  env: {
    ...process.env,
    MAESTRO_CLI_NO_ANALYTICS: '1',
    MAESTRO_NAME: plain.name,
    MAESTRO_EMAIL: plain.email,
    MAESTRO_PASSWORD: plain.password,
    MAESTRO_GUARDED_EMAIL: guarded.email,
    MAESTRO_GUARDED_PASSWORD: guarded.password,
    MAESTRO_BACKUP_CODE: backupCode,
    MAESTRO_LISTED_EMAIL: listed.email,
    MAESTRO_LISTED_PASSWORD: listed.password,
  },
});
maestro.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
