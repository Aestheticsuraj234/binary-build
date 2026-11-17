import 'server-only';

import type {ProviderKeyStatus} from '@binary/shared';
import {headers} from 'next/headers';
import {redirect} from 'next/navigation';

import {API_URL} from './api-url';

/**
 * Loads which provider keys the signed-in person has saved, for server
 * components. The API only ever returns the last 4 characters of a key.
 */
export async function fetchKeyStatuses(): Promise<ProviderKeyStatus[]> {
  const cookie = (await headers()).get('cookie') ?? '';
  const response = await fetch(`${API_URL}/api/keys`, {
    headers: {cookie},
    cache: 'no-store',
  });
  if (response.status === 401) {
    redirect('/sign-in');
  }
  if (!response.ok) {
    throw new Error(`Could not load your API keys (HTTP ${response.status}).`);
  }
  const body = (await response.json()) as {keys: ProviderKeyStatus[]};
  return body.keys;
}
