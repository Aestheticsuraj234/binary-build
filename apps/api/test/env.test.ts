import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

import {describe, expect, it} from 'vitest';

import {getTrustedOrigins, isPlaceholderSecret, parseEnv} from '../src/env';
import {TEST_ENCRYPTION_KEY} from './test-env';

const runFile = promisify(execFile);

const validEnv = {
  DATABASE_URL: 'postgres://binary:binary@localhost:5433/binary',
  BETTER_AUTH_SECRET: 'k7Hq2mX9vLp4Rz8Nw3Ts6Yb1Jc5Fd0Ga',
  ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
};

describe('parseEnv', () => {
  it('accepts a valid configuration and fills in defaults', () => {
    expect(parseEnv(validEnv)).toEqual({
      ...validEnv,
      BETTER_AUTH_URL: 'http://localhost:3001',
      WEB_URL: 'http://localhost:3000',
      PORT: 3001,
      NODE_ENV: 'development',
    });
  });

  it('refuses a missing secret', () => {
    expect(() =>
      parseEnv({...validEnv, BETTER_AUTH_SECRET: undefined}),
    ).toThrow('BETTER_AUTH_SECRET is missing.');
  });

  it('refuses the placeholder from .env.example', () => {
    expect(() =>
      parseEnv({
        ...validEnv,
        BETTER_AUTH_SECRET: 'replace-with-a-random-secret-0000000',
      }),
    ).toThrow('BETTER_AUTH_SECRET is still a placeholder.');
  });

  it('refuses a short secret', () => {
    expect(() =>
      parseEnv({...validEnv, BETTER_AUTH_SECRET: 'too-short'}),
    ).toThrow('BETTER_AUTH_SECRET must be at least 32 characters.');
  });

  it('refuses a missing master key', () => {
    expect(() => parseEnv({...validEnv, ENCRYPTION_KEY: undefined})).toThrow(
      'ENCRYPTION_KEY is missing.',
    );
  });

  it('refuses the master key placeholder from .env.example', () => {
    expect(() =>
      parseEnv({...validEnv, ENCRYPTION_KEY: 'replace-with-32-random-bytes'}),
    ).toThrow('ENCRYPTION_KEY is still a placeholder.');
  });

  it.each([
    ['16 bytes', Buffer.alloc(16, 1).toString('base64')],
    ['64 bytes', Buffer.alloc(64, 1).toString('base64')],
    ['not base64', 'this is not base64 at all, sorry!!'],
  ])('refuses a master key that is %s', (_label, key) => {
    expect(() => parseEnv({...validEnv, ENCRYPTION_KEY: key})).toThrow(
      'ENCRYPTION_KEY must be 32 random bytes, base64-encoded',
    );
  });

  it('refuses a missing database URL', () => {
    expect(() => parseEnv({...validEnv, DATABASE_URL: undefined})).toThrow(
      'DATABASE_URL must be set to a Postgres URL.',
    );
  });
});

describe('isPlaceholderSecret', () => {
  it.each([
    'replace-with-a-random-secret',
    'CHANGE-ME-please-0000000000000000000',
    'your-secret-here',
  ])('flags %s', secret => {
    expect(isPlaceholderSecret(secret)).toBe(true);
  });

  it('accepts a random value', () => {
    expect(isPlaceholderSecret(validEnv.BETTER_AUTH_SECRET)).toBe(false);
  });
});

describe('getTrustedOrigins', () => {
  it('trusts Expo Go only outside production', () => {
    const env = parseEnv(validEnv);

    expect(getTrustedOrigins(env)).toContain('exp://');
    expect(getTrustedOrigins({...env, NODE_ENV: 'production'})).toEqual([
      'http://localhost:3000',
      'binary://',
    ]);
  });
});

describe('API startup', () => {
  it('exits with an error when the master key is missing', async () => {
    const tsx = new URL('../node_modules/.bin/tsx', import.meta.url).pathname;
    const entry = new URL('../src/index.ts', import.meta.url).pathname;

    const start = runFile(tsx, [entry], {
      env: {...process.env, ...validEnv, ENCRYPTION_KEY: ''},
    });

    await expect(start).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('ENCRYPTION_KEY must be 32 random bytes'),
    });
  });

  it('exits with an error when the secret is a placeholder', async () => {
    const tsx = new URL('../node_modules/.bin/tsx', import.meta.url).pathname;
    const entry = new URL('../src/index.ts', import.meta.url).pathname;

    const start = runFile(tsx, [entry], {
      env: {
        ...process.env,
        ...validEnv,
        BETTER_AUTH_SECRET: 'replace-with-a-random-secret',
      },
    });

    await expect(start).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining(
        'BETTER_AUTH_SECRET is still a placeholder.',
      ),
    });
  });
});
