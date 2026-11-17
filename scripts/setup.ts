/**
 * One-time setup: `pnpm run setup`.
 *
 * 1. Creates .env from .env.example and fills in a random auth secret.
 * 2. Points the mobile app at this computer's Wi-Fi address.
 * 3. Starts Postgres in Docker.
 * 4. Creates the test database and runs migrations on both databases.
 *
 * Safe to run again: it keeps values you have already set.
 */
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {networkInterfaces} from 'node:os';

const ROOT = new URL('../', import.meta.url);
const ENV_FILE = new URL('.env', ROOT);
const ENV_EXAMPLE_FILE = new URL('.env.example', ROOT);
const MOBILE_ENV_FILE = new URL('apps/mobile/.env.local', ROOT);
const API_PORT = 3001;
const TEST_DATABASE = 'binary_test';

/** Runs a command in the repo root, showing its output. */
function run(command: string, args: string[], env?: NodeJS.ProcessEnv): void {
  execFileSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: {...process.env, ...env},
  });
}

/** Reads KEY=value lines into an object, skipping comments. */
function parseEnvFile(text: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of text.split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match?.[1] !== undefined && match[2] !== undefined) {
      values.set(match[1], match[2]);
    }
  }
  return values;
}

/** Makes sure .env exists, has every key, and has a real secret. */
function setUpEnvFile(): Map<string, string> {
  const example = readFileSync(ENV_EXAMPLE_FILE, 'utf8');
  if (!existsSync(ENV_FILE)) {
    writeFileSync(ENV_FILE, example);
    console.log('Created .env from .env.example');
  }

  let text = readFileSync(ENV_FILE, 'utf8');
  const current = parseEnvFile(text);

  // Add any keys that are in the example but missing from .env.
  for (const [key, value] of parseEnvFile(example)) {
    if (!current.has(key)) {
      text = `${text.trimEnd()}\n${key}=${value}\n`;
      current.set(key, value);
      console.log(`Added ${key} to .env`);
    }
  }

  // Replace a placeholder secret with a random one.
  const secret = current.get('BETTER_AUTH_SECRET') ?? '';
  if (secret.length < 32 || secret.startsWith('replace-')) {
    const newSecret = randomBytes(32).toString('base64url');
    text = text.replace(
      /^BETTER_AUTH_SECRET=.*$/m,
      `BETTER_AUTH_SECRET=${newSecret}`,
    );
    current.set('BETTER_AUTH_SECRET', newSecret);
    console.log('Generated a random BETTER_AUTH_SECRET');
  }

  writeFileSync(ENV_FILE, text);
  return current;
}

/** Finds this computer's address on the local network, like 192.168.1.20. */
function findLanAddress(): string | undefined {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        return address.address;
      }
    }
  }
  return undefined;
}

/** Tells the mobile app where the API is. A phone cannot use "localhost". */
function setUpMobileEnv(): void {
  const host = findLanAddress() ?? 'localhost';
  writeFileSync(
    MOBILE_ENV_FILE,
    [
      '# Written by `pnpm run setup`. Re-run it if your Wi-Fi address changes.',
      `EXPO_PUBLIC_API_URL=http://${host}:${API_PORT}`,
      '',
    ].join('\n'),
  );
  console.log(`Mobile app will call the API at http://${host}:${API_PORT}`);
}

/** Creates the test database inside the Postgres container if needed. */
function createTestDatabase(): void {
  const psql = ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'binary'];
  const exists = execFileSync(
    'docker',
    [
      ...psql,
      '-tAc',
      `SELECT 1 FROM pg_database WHERE datname = '${TEST_DATABASE}'`,
    ],
    {cwd: ROOT, encoding: 'utf8'},
  ).trim();
  if (exists !== '1') {
    run('docker', [...psql, '-c', `CREATE DATABASE ${TEST_DATABASE}`]);
  }
}

function main(): void {
  const env = setUpEnvFile();
  setUpMobileEnv();

  console.log('\nStarting Postgres…');
  run('docker', ['compose', 'up', '-d', '--wait']);
  createTestDatabase();

  console.log('\nMigrating the dev database…');
  run('pnpm', ['--filter', '@binary/db', 'db:migrate']);
  console.log('\nMigrating the test database…');
  run('pnpm', ['--filter', '@binary/db', 'db:migrate'], {
    DATABASE_URL: env.get('TEST_DATABASE_URL'),
  });

  console.log(
    '\nSetup complete. Next: `pnpm dev`, and `pnpm mobile` for the phone.',
  );
}

main();
