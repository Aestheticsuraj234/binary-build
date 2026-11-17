import {createCipheriv, createDecipheriv, randomBytes} from 'node:crypto';

/** AES-256 needs a 32-byte key. */
export const MASTER_KEY_BYTES = 32;

const ALGORITHM = 'aes-256-gcm';
/** GCM's recommended nonce size. A fresh one is made for every encryption. */
const IV_BYTES = 12;
/** Marks the format, so the master key can be rotated later. */
const FORMAT_VERSION = 'v1';

/**
 * Who a secret belongs to. It is mixed into the encryption (as "additional
 * authenticated data"), so an encrypted value copied onto another person's
 * row, or onto another provider, refuses to decrypt.
 */
export interface SecretOwner {
  userId: string;
  provider: string;
}

/** Thrown when a stored value cannot be decrypted. Never contains the secret. */
export class VaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultError';
  }
}

/** Encrypts and decrypts provider keys with one master key. */
export interface Vault {
  encrypt(plainText: string, owner: SecretOwner): string;
  decrypt(stored: string, owner: SecretOwner): string;
}

/** Turns the owner into the bytes that get authenticated with the secret. */
function ownerBytes(owner: SecretOwner): Buffer {
  return Buffer.from(`${owner.userId}:${owner.provider}`, 'utf8');
}

/**
 * Creates a vault from a base64-encoded 32-byte master key.
 *
 * Stored values look like `v1.<iv>.<auth tag>.<ciphertext>`, each part
 * base64url-encoded. The auth tag lets decryption detect any change.
 */
export function createVault(masterKeyBase64: string): Vault {
  const masterKey = Buffer.from(masterKeyBase64, 'base64');
  if (masterKey.length !== MASTER_KEY_BYTES) {
    throw new VaultError(
      `The master key must be ${MASTER_KEY_BYTES} bytes, base64-encoded.`,
    );
  }

  return {
    encrypt(plainText, owner) {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, masterKey, iv);
      cipher.setAAD(ownerBytes(owner));
      const ciphertext = Buffer.concat([
        cipher.update(plainText, 'utf8'),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      return [
        FORMAT_VERSION,
        iv.toString('base64url'),
        authTag.toString('base64url'),
        ciphertext.toString('base64url'),
      ].join('.');
    },

    decrypt(stored, owner) {
      const [version, iv, authTag, ciphertext] = stored.split('.');
      if (
        version !== FORMAT_VERSION ||
        iv === undefined ||
        authTag === undefined ||
        ciphertext === undefined
      ) {
        throw new VaultError('This stored key is not in a format we know.');
      }

      try {
        const decipher = createDecipheriv(
          ALGORITHM,
          masterKey,
          Buffer.from(iv, 'base64url'),
        );
        decipher.setAAD(ownerBytes(owner));
        decipher.setAuthTag(Buffer.from(authTag, 'base64url'));
        return Buffer.concat([
          decipher.update(Buffer.from(ciphertext, 'base64url')),
          decipher.final(),
        ]).toString('utf8');
      } catch {
        // Wrong master key, wrong owner, or the value was changed.
        throw new VaultError('This stored key could not be decrypted.');
      }
    },
  };
}
