import 'server-only';

import type {
  AgentSummary,
  AgentTemplateSummary,
  IntegrationsCatalog,
  ProviderKeyStatus,
  RoutineDetail,
  RunnerSummary,
  ComputersOverview,
  RoutinesOverview,
  ThreadDetail,
  TodayOverview,
  ThreadSummary,
  ToolsOverview,
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

/** Recent chats, newest first. */
export const fetchThreads = cache(async (): Promise<ThreadSummary[]> => {
  const body = await apiGet<{threads: ThreadSummary[]}>('/api/threads');
  return body?.threads ?? [];
});

/** One chat with its messages, or null if it doesn't exist or isn't theirs. */
export const fetchThread = cache(
  async (id: string): Promise<ThreadDetail | null> =>
    apiGet<ThreadDetail>(`/api/threads/${encodeURIComponent(id)}`),
);

/** Built-in tools, and each connected app with its tools (or its error). */
export const fetchToolsOverview = cache(async (): Promise<ToolsOverview> => {
  const body = await apiGet<ToolsOverview>('/api/apps');
  return body ?? {builtIn: [], apps: []};
});

/** Every Composio integration, with this person's status for each. */
export const fetchIntegrations = cache(
  async (): Promise<IntegrationsCatalog> => {
    const body = await apiGet<IntegrationsCatalog>('/api/integrations');
    return (
      body ?? {available: false, integrations: [], categories: [], error: null}
    );
  },
);

/** This person's routines, and whether their schedules can fire. */
export const fetchRoutines = cache(async (): Promise<RoutinesOverview> => {
  const body = await apiGet<RoutinesOverview>('/api/routines');
  return body ?? {routines: [], schedulesEnabled: false, timeZone: null};
});

/** One routine with its runs, or null if it doesn't exist or isn't theirs. */
export const fetchRoutine = cache(
  async (id: string): Promise<RoutineDetail | null> =>
    apiGet<RoutineDetail>(`/api/routines/${encodeURIComponent(id)}`),
);

/** Requests waiting for the person, and recent routine runs. */
export const fetchToday = cache(async (): Promise<TodayOverview> => {
  const body = await apiGet<TodayOverview>('/api/today');
  return body ?? {waiting: [], recentRuns: []};
});

/** How many requests wait for the person, for the Today badge. */
export const fetchPendingCount = cache(async (): Promise<number> => {
  const body = await apiGet<{pending: number}>('/api/approvals/count');
  return body?.pending ?? 0;
});

/** Which kinds of computer are on, and what's running. */
export const fetchComputers = cache(async (): Promise<ComputersOverview> => {
  const body = await apiGet<ComputersOverview>('/api/computers');
  return (
    body ?? {
      sandbox: {available: false, idleMinutes: 5},
      browser: {available: false, idleMinutes: 10, maxOpen: 5},
      desktop: {available: false, idleMinutes: 10},
      computers: [],
    }
  );
});

/** This person's paired computers (Runners). */
export const fetchRunners = cache(async (): Promise<RunnerSummary[]> => {
  const body = await apiGet<{runners: RunnerSummary[]}>('/api/runners');
  return body?.runners ?? [];
});
