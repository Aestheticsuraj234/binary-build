import {PlusIcon} from 'lucide-react';
import {headers} from 'next/headers';
import Link from 'next/link';
import type {ReactNode} from 'react';
import {Suspense} from 'react';

import {CharacterFace} from '@/components/characters/character-face';
import {Logo} from '@/components/logo';
import {NavLinkList, NavLinks} from '@/components/nav-links';
import {SignOutButton} from '@/components/sign-out-button';
import {Skeleton} from '@/components/ui/skeleton';
import {RecentChats} from '@/components/shell/recent-chats';
import {fetchAgents, fetchThreads} from '@/lib/api';
import {getSessionUser} from '@/lib/session';

/** "Ada Lovelace" becomes "AL". Falls back to the email's first letters. */
function initialsOf(name: string, email: string): string {
  const fromName = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('');
  return (fromName || email.slice(0, 2)).toUpperCase();
}

/** "Your crew": every hired agent, one tap away. */
async function CrewList() {
  const agents = await fetchAgents();
  if (agents.length === 0) {
    return (
      <p className="px-3 text-sm text-muted-foreground">No one hired yet.</p>
    );
  }
  return (
    <ul className="flex flex-col gap-0.5">
      {agents.map(agent => (
        <li key={agent.id}>
          <Link
            href={`/agents/${agent.id}`}
            className="flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-secondary/60"
          >
            <CharacterFace
              character={agent.avatar}
              size={36}
              animated={false}
              className="shrink-0"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {agent.name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {agent.role}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** "New chat", then Recent chats and the crew in one scrolling list. */
async function Conversations({
  idPrefix,
  children,
}: {
  idPrefix: string;
  children: ReactNode;
}) {
  const [threads, agents] = await Promise.all([fetchThreads(), fetchAgents()]);
  return (
    <RecentChats
      initialThreads={threads}
      fallbackAgentId={agents[0]?.id ?? null}
      idPrefix={idPrefix}
    >
      {children}
    </RecentChats>
  );
}

/** The signed-in person, with a sign-out button. */
async function UserCard() {
  const user = await getSessionUser((await headers()).get('cookie'));
  if (!user) {
    return null;
  }
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-full border border-input bg-secondary text-xs text-muted-foreground"
      >
        {initialsOf(user.name, user.email)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{user.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {user.email}
        </span>
      </span>
      <SignOutButton iconOnly />
    </div>
  );
}

/**
 * Everything in the sidebar. The desktop sidebar and the phone menu both
 * show this, so they always match.
 */
export function SidebarContent({idPrefix}: {idPrefix: string}) {
  const crewHeadingId = `${idPrefix}-crew-heading`;
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link href="/" aria-label="Binary home" className="px-1 pt-1">
        <Logo />
      </Link>
      {/* The URL is only known at request time, so the highlight streams in. */}
      <Suspense fallback={<NavLinkList activePath={null} />}>
        <NavLinks />
      </Suspense>
      <Suspense
        fallback={
          <div className="flex flex-1 flex-col gap-3">
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        }
      >
        <Conversations idPrefix={idPrefix}>
          <section aria-labelledby={crewHeadingId}>
            <div className="mb-2 flex items-center justify-between pr-1 pl-3">
              <h2
                id={crewHeadingId}
                className="text-xs font-medium tracking-wider text-muted-foreground uppercase"
              >
                Your crew
              </h2>
              <Link
                href="/agents/new"
                aria-label="Hire a character"
                title="Hire a character"
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
              >
                <PlusIcon aria-hidden className="size-4" />
              </Link>
            </div>
            <CrewList />
          </section>
        </Conversations>
      </Suspense>
      <Suspense fallback={<Skeleton className="h-16 rounded-lg" />}>
        <UserCard />
      </Suspense>
    </div>
  );
}
