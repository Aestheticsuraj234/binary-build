import 'server-only';

import type {
  AgentSummary,
  AgentTemplateSummary,
  ProviderKeyStatus,
} from '@binary/shared';
import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {cache} from 'react';

import {API_URL} from './api-url';

/**
 * Calls the API from a server component, as the signed-in person. Returns
 * null for a 404; sends people to sign in on a 401.
 */
async function apiGet<T>(path: string): Promise<T | null> {
  const cookie = (await headers()).get('cookie') ?? '';
  const response = await fetch(`${API_URL}${path}`, {
    headers: {cookie},
    cache: 'no-store',
  });
  if (response.status === 401) {
    redirect('/sign-in');
  }
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`The API answered ${response.status} for ${path}.`);
  }
  return (await response.json()) as T;
}

// `cache` shares one result per page load, so the sidebar and the page can
// both ask for the crew without calling the API twice.

/** Which provider keys are saved. Only the last 4 characters come back. */
export const fetchKeyStatuses = cache(
  async (): Promise<ProviderKeyStatus[]> => {
    const body = await apiGet<{keys: ProviderKeyStatus[]}>('/api/keys');
    return body?.keys ?? [];
  },
);

/** The signed-in person's agents. */
export const fetchAgents = cache(async (): Promise<AgentSummary[]> => {
  const body = await apiGet<{agents: AgentSummary[]}>('/api/agents');
  return body?.agents ?? [];
});

/** One agent, or null if it doesn't exist or isn't theirs. */
export const fetchAgent = cache(
  async (id: string): Promise<AgentSummary | null> => {
    const body = await apiGet<{agent: AgentSummary}>(
      `/api/agents/${encodeURIComponent(id)}`,
    );
    return body?.agent ?? null;
  },
);

/** The shared templates. */
export const fetchTemplates = cache(
  async (): Promise<AgentTemplateSummary[]> => {
    const body = await apiGet<{templates: AgentTemplateSummary[]}>(
      '/api/agent-templates',
    );
    return body?.templates ?? [];
  },
);
