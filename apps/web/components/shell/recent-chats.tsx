'use client';

import type {ThreadSummary} from '@binary/shared';
import {cn} from 'cn';
import {MessageSquarePlusIcon, Trash2Icon} from 'lucide-react';
import Link from 'next/link';
import {usePathname, useRouter} from 'next/navigation';
import type {ReactNode} from 'react';
import {useSyncExternalStore} from 'react';

import {CharacterFace} from '@/components/characters/character-face';
import {
  announceChatsChanged,
  forgetChat,
  getRecentChats,
  subscribeToRecentChats,
} from '@/lib/chat-events';
import {callApi} from '@/lib/client-api';

interface RecentChatsProps {
  /** The list as the server saw it when the page loaded. */
  initialThreads: ThreadSummary[];
  /** Who "New chat" talks to when no chat is open: the first crew member. */
  fallbackAgentId: string | null;
  idPrefix: string;
  /** More sidebar sections, scrolled together with the list. */
  children?: ReactNode;
}

/** The agent the page is about, from a /agents/… or /chats/… address. */
function agentOnPage(
  pathname: string | null,
  threads: ThreadSummary[],
): string | undefined {
  const [, section, id] = pathname?.split('/') ?? [];
  if (section === 'agents' && id && id !== 'new') {
    return id;
  }
  if (section === 'chats') {
    return threads.find(thread => thread.id === id)?.agentId;
  }
  return undefined;
}

/**
 * "New chat" and "Recent chats": every saved chat, newest first. The list
 * reloads when this tab saves or deletes a chat.
 */
export function RecentChats({
  initialThreads,
  fallbackAgentId,
  idPrefix,
  children,
}: RecentChatsProps) {
  const pathname = usePathname();
  const router = useRouter();
  // Starts from the list the server sent, then follows this tab's changes.
  // The phone menu mounts this when it opens, so it gets the newest list.
  const threads =
    useSyncExternalStore(
      subscribeToRecentChats,
      getRecentChats,
      () => undefined,
    ) ?? initialThreads;

  const newChatAgent = agentOnPage(pathname, threads) ?? fallbackAgentId;
  const headingId = `${idPrefix}-recent-heading`;

  async function remove(thread: ThreadSummary) {
    const name = thread.title ?? 'this chat';
    if (!window.confirm(`Delete “${name}”? This can’t be undone.`)) {
      return;
    }
    try {
      await callApi(`/api/threads/${thread.id}`, {method: 'DELETE'});
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
      return;
    }
    forgetChat(thread.id, threads);
    announceChatsChanged();
    if (pathname === `/chats/${thread.id}`) {
      router.push(`/agents/${thread.agentId}`);
    }
  }

  return (
    <>
      <Link
        href={newChatAgent ? `/agents/${newChatAgent}` : '/agents/new'}
        className="flex h-10 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <MessageSquarePlusIcon aria-hidden className="size-4" />
        New chat
      </Link>
      <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-1">
        <section aria-labelledby={headingId}>
          <h2
            id={headingId}
            className="mb-2 px-3 text-xs font-medium tracking-wider text-muted-foreground uppercase"
          >
            Recent chats
          </h2>
          {threads.length === 0 ? (
            <p className="px-3 text-sm text-muted-foreground">
              Your chats will show up here.
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {threads.map(thread => {
                const isActive = pathname === `/chats/${thread.id}`;
                return (
                  <li key={thread.id} className="group relative">
                    <Link
                      href={`/chats/${thread.id}`}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2.5 rounded-md py-1.5 pr-9 pl-2 text-sm transition-colors',
                        isActive
                          ? 'bg-secondary font-medium'
                          : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                      )}
                    >
                      <CharacterFace
                        character={thread.avatar}
                        size={24}
                        animated={false}
                        className="shrink-0"
                      />
                      <span className="min-w-0 truncate">
                        {thread.title ?? 'New chat'}
                        <span className="sr-only">
                          {' '}
                          with {thread.agentName}
                        </span>
                      </span>
                    </Link>
                    <button
                      type="button"
                      aria-label={`Delete chat “${thread.title ?? 'New chat'}”`}
                      onClick={() => void remove(thread)}
                      className="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-background hover:text-destructive focus-visible:opacity-100 pointer-coarse:opacity-100"
                    >
                      <Trash2Icon aria-hidden className="size-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        {children}
      </div>
    </>
  );
}
