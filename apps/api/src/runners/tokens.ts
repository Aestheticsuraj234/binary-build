import {createHash, randomBytes, randomInt} from 'node:crypto';

/** Letters and digits that can't be confused (no 0/O, 1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** How long a pairing code works. */
export const PAIRING_CODE_MS = 10 * 60 * 1000;

/** A one-time pairing code like "K7QD-3MXP". */
export function newPairingCode(): string {
  const chars = Array.from(
    {length: 8},
    () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
  );
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

/** "k7qd 3mxp" and "K7QD-3MXP" are the same code. */
export function normaliseCode(code: string): string {
  const raw = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
}

/** A Runner's token, shown only to the Runner. */
export function newRunnerToken(): string {
  return `brt_${randomBytes(32).toString('base64url')}`;
}

/** SHA-256, as hex: how codes and tokens are stored. */
export function hashSecret(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
