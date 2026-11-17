import type {Database, ProviderKeyRow} from '@binary/db';
import {and, eq, providerKeys} from '@binary/db';
import type {ProviderId, ProviderKeyStatus} from '@binary/shared';
import {PROVIDER_IDS} from '@binary/shared';

import type {Vault} from './vault';

/** Describes a saved key (or its absence) without the key itself. */
function toStatus(
  provider: ProviderId,
  row: Pick<ProviderKeyRow, 'last4' | 'updatedAt'> | undefined,
): ProviderKeyStatus {
  return {
    provider,
    connected: row !== undefined,
    last4: row?.last4 ?? null,
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}

/** Every provider, with whether this person has saved a key for it. */
export async function listKeyStatuses(
  db: Database,
  userId: string,
): Promise<ProviderKeyStatus[]> {
  // Only safe columns are selected: the encrypted key never leaves here.
  const rows = await db
    .select({
      provider: providerKeys.provider,
      last4: providerKeys.last4,
      updatedAt: providerKeys.updatedAt,
    })
    .from(providerKeys)
    .where(eq(providerKeys.userId, userId));

  return PROVIDER_IDS.map(provider =>
    toStatus(
      provider,
      rows.find(row => row.provider === provider),
    ),
  );
}

/** Encrypts and saves a key, replacing any key already saved. */
export async function saveKey(
  db: Database,
  vault: Vault,
  userId: string,
  provider: ProviderId,
  plainKey: string,
): Promise<ProviderKeyStatus> {
  const encryptedKey = vault.encrypt(plainKey, {userId, provider});
  const last4 = plainKey.slice(-4);

  const [row] = await db
    .insert(providerKeys)
    .values({userId, provider, encryptedKey, last4})
    .onConflictDoUpdate({
      target: [providerKeys.userId, providerKeys.provider],
      set: {encryptedKey, last4, updatedAt: new Date()},
    })
    .returning({last4: providerKeys.last4, updatedAt: providerKeys.updatedAt});

  return toStatus(provider, row);
}

/** Deletes a saved key. Removing a key that isn't there is fine. */
export async function removeKey(
  db: Database,
  userId: string,
  provider: ProviderId,
): Promise<ProviderKeyStatus> {
  await db
    .delete(providerKeys)
    .where(
      and(eq(providerKeys.userId, userId), eq(providerKeys.provider, provider)),
    );
  return toStatus(provider, undefined);
}

/** The encrypted key, for the engine factory to decrypt. */
export async function findEncryptedKey(
  db: Database,
  userId: string,
  provider: ProviderId,
): Promise<string | undefined> {
  const [row] = await db
    .select({encryptedKey: providerKeys.encryptedKey})
    .from(providerKeys)
    .where(
      and(eq(providerKeys.userId, userId), eq(providerKeys.provider, provider)),
    )
    .limit(1);
  return row?.encryptedKey;
}
