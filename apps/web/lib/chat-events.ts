import type {ThreadSummary} from '@binary/shared';

import {callApi} from './client-api';

/*
 * Recent chats for this tab. The chat calls `announceChatsChanged` after
 * saving or deleting; the list reloads and every copy of it (the desktop
 * sidebar and the phone menu) updates. Other tabs see changes on reload.
 */

/** The newest list this tab has loaded, or undefined before the first change. */
let latest: ThreadSummary[] | undefined;
const listeners = new Set<() => void>();

function setRecentChats(threads: ThreadSummary[]): void {
  latest = threads;
  listeners.forEach(listener => listener());
}

/** For `useSyncExternalStore`: the current list. */
export function getRecentChats(): ThreadSummary[] | undefined {
  return latest;
}

/** For `useSyncExternalStore`: calls `listener` when the list changes. */
export function subscribeToRecentChats(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Removes a deleted chat at once, before the reload confirms it. */
export function forgetChat(threadId: string, current: ThreadSummary[]): void {
  setRecentChats(current.filter(thread => thread.id !== threadId));
}

/** Reloads Recent chats after a chat was saved or deleted. */
export function announceChatsChanged(): void {
  callApi<{threads: ThreadSummary[]}>('/api/threads')
    .then(body => setRecentChats(body.threads))
    .catch(() => {
      // Keep the old list; it reloads on the next change.
    });
}
