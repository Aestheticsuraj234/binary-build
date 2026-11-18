import type {Integration, IntegrationStatus} from '@binary/shared';

/** The status tabs on the Integrations page. */
export type StatusFilter = 'all' | 'connected' | 'not-connected';

export interface IntegrationFilters {
  query: string;
  /** A category name, or '' for every category. */
  category: string;
  status: StatusFilter;
}

/** Counts as connected for the tabs: working, or on its way. */
export function isConnectedish(status: IntegrationStatus): boolean {
  return status !== 'not-connected';
}

/** The integrations matching the search, category and status. */
export function filterIntegrations(
  integrations: Integration[],
  {query, category, status}: IntegrationFilters,
): Integration[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return integrations.filter(integration => {
    if (status === 'connected' && !isConnectedish(integration.status)) {
      return false;
    }
    if (status === 'not-connected' && isConnectedish(integration.status)) {
      return false;
    }
    if (category && !integration.categories.includes(category)) {
      return false;
    }
    const haystack =
      `${integration.name} ${integration.slug} ${integration.description} ${integration.categories.join(' ')}`.toLowerCase();
    return words.every(word => haystack.includes(word));
  });
}
