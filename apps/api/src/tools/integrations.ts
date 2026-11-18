import type {Database} from '@binary/db';
import {EnabledToolkitRepository} from '@binary/db';
import type {
  Integration,
  IntegrationCategory,
  IntegrationStatus,
} from '@binary/shared';
import {authMethodLabel} from '@binary/shared';

import type {CatalogEntry, ComposioAccount, ComposioGateway} from './composio';

/** A sign-in started longer ago than this was abandoned. */
const PENDING_FOR_MS = 15 * 60 * 1000;

const STATUS_RANK: Record<IntegrationStatus, number> = {
  connected: 3,
  'needs-attention': 2,
  pending: 1,
  'not-connected': 0,
};

function accountStatus(
  account: ComposioAccount,
  now: number,
): IntegrationStatus {
  switch (account.status) {
    case 'ACTIVE':
      return 'connected';
    case 'INITIATED':
    case 'INITIALIZING': {
      const startedAt = account.createdAt ? Date.parse(account.createdAt) : 0;
      return now - startedAt < PENDING_FOR_MS ? 'pending' : 'not-connected';
    }
    case 'EXPIRED':
    case 'FAILED':
    case 'INACTIVE':
    case 'REVOKED':
      return 'needs-attention';
    default:
      return 'not-connected';
  }
}

/**
 * Where an integration stands for one person. A no-account toolkit is
 * connected when they switched it on; otherwise their best account wins
 * (one working account is enough).
 */
export function statusOf(
  entry: CatalogEntry,
  accounts: ComposioAccount[],
  enabled: readonly string[],
  now = Date.now(),
): IntegrationStatus {
  if (entry.noAuth) {
    return enabled.includes(entry.slug) ? 'connected' : 'not-connected';
  }
  return accounts
    .filter(account => account.toolkit === entry.slug)
    .map(account => accountStatus(account, now))
    .reduce<IntegrationStatus>(
      (best, status) =>
        STATUS_RANK[status] > STATUS_RANK[best] ? status : best,
      'not-connected',
    );
}

export function toIntegration(
  entry: CatalogEntry,
  status: IntegrationStatus,
): Integration {
  const schemes = entry.noAuth ? ['NO_AUTH'] : entry.authSchemes;
  return {
    slug: entry.slug,
    name: entry.name,
    logo: entry.logo,
    description: entry.description,
    categories: entry.categories.map(category => category.name),
    authMethods: [...new Set(schemes.map(authMethodLabel))],
    isManaged: entry.noAuth || entry.managedSchemes.length > 0,
    needsNoAccount: entry.noAuth,
    toolsCount: entry.toolsCount,
    status,
  };
}

/** Every category used in the catalog, biggest first. */
export function categoriesOf(entries: CatalogEntry[]): IntegrationCategory[] {
  const counts = new Map<string, IntegrationCategory>();
  for (const entry of entries) {
    for (const {slug, name} of entry.categories) {
      const category = counts.get(slug) ?? {slug, name, count: 0};
      category.count++;
      counts.set(slug, category);
    }
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
}

/**
 * The toolkits whose tools this person's agents get: every one with a
 * working account, plus the no-account ones they switched on.
 */
export async function activeToolkits(
  composio: ComposioGateway,
  db: Database,
  userId: string,
): Promise<string[]> {
  const [accounts, enabled] = await Promise.all([
    composio.accounts(userId),
    new EnabledToolkitRepository(db).listForUser(userId),
  ]);
  const withAccount = accounts
    .filter(account => account.status === 'ACTIVE')
    .map(account => account.toolkit);
  return [...new Set([...withAccount, ...enabled])];
}
