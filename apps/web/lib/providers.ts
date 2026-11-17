import type {ProviderId, ProviderKeyStatus} from '@binary/shared';

/** The providers this person has a key for, in the usual order. */
export function connectedProviders(keys: ProviderKeyStatus[]): ProviderId[] {
  return keys.filter(key => key.connected).map(key => key.provider);
}
