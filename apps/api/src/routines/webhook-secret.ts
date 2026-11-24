import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';

/** Every webhook secret starts with this, so it's easy to recognise. */
export const WEBHOOK_SECRET_PREFIX = 'whsec_';

/** SHA-256 of a secret, as hex. The only form a secret is stored in. */
export function hashWebhookSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

/**
 * A new random secret and its hash. Show `secret` once and store `hash`.
 * 32 random bytes are far beyond guessing, so a plain SHA-256 (rather than
 * a slow password hash) is enough to keep the stored value useless.
 */
export function newWebhookSecret(): {secret: string; hash: string} {
  const secret = `${WEBHOOK_SECRET_PREFIX}${randomBytes(32).toString('base64url')}`;
  return {secret, hash: hashWebhookSecret(secret)};
}

/**
 * Whether `secret` matches the stored hash. The comparison takes the same
 * time whatever the input, so timing can't reveal the hash.
 */
export function matchesWebhookSecret(
  secret: string | undefined,
  storedHash: string | null,
): boolean {
  if (!secret || !storedHash) {
    return false;
  }
  const given = Buffer.from(hashWebhookSecret(secret), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  return given.length === stored.length && timingSafeEqual(given, stored);
}

/** The secret from an `Authorization: Bearer …` header. */
export function secretFromAuthorization(
  header: string | undefined,
): string | undefined {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header ?? '');
  return match?.[1];
}
