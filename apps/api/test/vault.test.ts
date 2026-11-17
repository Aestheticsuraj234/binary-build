import {randomBytes} from 'node:crypto';

import {describe, expect, it} from 'vitest';

import {createVault, VaultError} from '../src/vault';
import {TEST_ENCRYPTION_KEY} from './test-env';

const vault = createVault(TEST_ENCRYPTION_KEY);
const owner = {userId: 'user-1', provider: 'openai'};
const secret = 'sk-test-0123456789abcdefghijklmnop';

describe('vault', () => {
  it('decrypts what it encrypted', () => {
    const stored = vault.encrypt(secret, owner);

    expect(vault.decrypt(stored, owner)).toBe(secret);
  });

  it('never stores the key in readable form', () => {
    const stored = vault.encrypt(secret, owner);

    expect(stored).not.toContain(secret);
    expect(stored).not.toContain(secret.slice(-8));
    expect(stored.startsWith('v1.')).toBe(true);
  });

  it('gives a different result every time (fresh IV)', () => {
    expect(vault.encrypt(secret, owner)).not.toBe(vault.encrypt(secret, owner));
  });

  it('refuses a value that was changed', () => {
    const [version, iv, tag, ciphertext] = vault
      .encrypt(secret, owner)
      .split('.');
    const flipped = ciphertext!.startsWith('A')
      ? `B${ciphertext!.slice(1)}`
      : `A${ciphertext!.slice(1)}`;

    expect(() =>
      vault.decrypt([version, iv, tag, flipped].join('.'), owner),
    ).toThrow(VaultError);
  });

  it("refuses a value copied onto another person's row", () => {
    const stored = vault.encrypt(secret, owner);

    expect(() =>
      vault.decrypt(stored, {userId: 'user-2', provider: 'openai'}),
    ).toThrow(VaultError);
  });

  it('refuses a value copied onto another provider', () => {
    const stored = vault.encrypt(secret, owner);

    expect(() =>
      vault.decrypt(stored, {userId: 'user-1', provider: 'anthropic'}),
    ).toThrow(VaultError);
  });

  it('refuses a value encrypted with a different master key', () => {
    const otherVault = createVault(randomBytes(32).toString('base64'));
    const stored = otherVault.encrypt(secret, owner);

    expect(() => vault.decrypt(stored, owner)).toThrow(
      'This stored key could not be decrypted.',
    );
  });

  it('refuses a value in an unknown format', () => {
    expect(() => vault.decrypt('not-encrypted', owner)).toThrow(VaultError);
  });

  it('refuses a master key that is not 32 bytes', () => {
    expect(() => createVault(randomBytes(16).toString('base64'))).toThrow(
      VaultError,
    );
  });
});
