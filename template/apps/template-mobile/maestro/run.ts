import { type ChildProcess, spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { closeSync, openSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
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

interface Api {
  readonly log: string;
  readonly child: ChildProcess;
}

const apiUrl = process.env.API_URL ?? 'http://127.0.0.1:3000';
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://template_api:local-only@127.0.0.1:5433/template_api';
const origin = new URL(process.env.AUTH_URL ?? 'http://localhost:3001').origin;
const apiFolder = fileURLToPath(new URL('../../template-api/', import.meta.url));
const domain = 'screens.example';
const thisMachine = new Set(['127.0.0.1', 'localhost', '[::1]']);
const startTime = 90_000;

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

function hide(...secrets: readonly string[]): void {
  if (process.env.GITHUB_ACTIONS !== 'true') {
    return;
  }
  for (const secret of secrets) {
    process.stdout.write(`::add-mask::${secret}\n`);
  }
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

function finished(child: ChildProcess): Promise<number> {
  return new Promise((resolve) => {
    child.on('exit', (code) => {
      resolve(code ?? 1);
    });
  });
}

function tail(log: string): string {
  return readFileSync(log, 'utf8').trimEnd().split('\n').slice(-60).join('\n');
}

async function answers(): Promise<boolean> {
  try {
    return (await fetch(new URL('/api/auth/ok', apiUrl))).ok;
  } catch {
    return false;
  }
}

async function startApi(): Promise<Api> {
  const migrate = spawn(process.execPath, ['--env-file=.env.development', 'src/migrate.ts'], {
    cwd: apiFolder,
    stdio: 'inherit',
  });
  if ((await finished(migrate)) !== 0) {
    throw new Error('The migrations of the API failed, so the screen tests cannot start it');
  }
  const log = join(tmpdir(), `screens-api-${process.pid}.log`);
  const output = openSync(log, 'w');
  const child = spawn(
    process.execPath,
    ['--env-file=.env.development', '--import', '@zigordev/otel/register', 'src/main.ts'],
    { cwd: apiFolder, stdio: ['ignore', output, output] }
  );
  closeSync(output);
  const deadline = Date.now() + startTime;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`The API stopped with code ${child.exitCode}:\n${tail(log)}`);
    }
    if (await answers()) {
      return { log, child };
    }
    await sleep(500);
  }
  child.kill();
  throw new Error(`The API did not answer within ${startTime / 1000} seconds:\n${tail(log)}`);
}

function stopApi(api: Api | undefined, failed: boolean): void {
  if (api === undefined) {
    return;
  }
  api.child.kill();
  if (failed) {
    process.stderr.write(`The last lines the API wrote:\n${tail(api.log)}\n`);
  }
  rmSync(api.log, { force: true });
}

onThisMachine(apiUrl, 'the API');
onThisMachine(databaseUrl, 'the database');

const given = process.argv.slice(2);
const args = given[0] === '--' ? given.slice(1) : given;
const withApi = args.includes('--with-api');
const options = args.filter((arg) => arg !== '--with-api');

const plain = person('Ada Lovelace', 'ada');
const guarded = person('Grace Hopper', 'grace');
const listed = person('Mary Somerville', 'mary');
hide(plain.password, guarded.password, listed.password);

const api = withApi ? await startApi() : undefined;
let code = 1;
try {
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
  hide(backupCode);
  await writeNotes(listed, 21);

  const flows = fileURLToPath(new URL('flows', import.meta.url));
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
  code = await finished(maestro);
} finally {
  stopApi(api, code !== 0);
}
process.exitCode = code;
