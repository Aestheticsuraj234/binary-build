import {callApi} from './client-api';

/*
 * The Today badge's count for this tab. Deciding a request, or an answer
 * that asks for one, calls `announceApprovalsChanged`; the count reloads
 * and every copy of the badge (the desktop sidebar and the phone menu)
 * updates. Other tabs see changes on reload.
 */

/** The newest count this tab has loaded, or undefined before any change. */
let latest: number | undefined;
const listeners = new Set<() => void>();

/** For `useSyncExternalStore`: the current count. */
export function getPendingCount(): number | undefined {
  return latest;
}

/** For `useSyncExternalStore`: calls `listener` when the count changes. */
export function subscribeToPendingCount(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reloads the Today count after something may have changed it. */
export function announceApprovalsChanged(): void {
  callApi<{pending: number}>('/api/approvals/count')
    .then(body => {
      latest = body.pending;
      listeners.forEach(listener => listener());
    })
    .catch(() => {
      // Keep the old count; it reloads on the next change.
    });
}
