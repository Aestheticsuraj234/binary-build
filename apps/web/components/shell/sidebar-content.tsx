import {PlusIcon} from 'lucide-react';
import {headers} from 'next/headers';
import Link from 'next/link';
import {Suspense} from 'react';

import {CharacterFace} from '@/components/characters/character-face';
import {Logo} from '@/components/logo';
import {NavLinkList, NavLinks} from '@/components/nav-links';
import {SignOutButton} from '@/components/sign-out-button';
import {Skeleton} from '@/components/ui/skeleton';
import {fetchAgents} from '@/lib/api';
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
      <Link
        href="/agents/new"
        className="flex h-10 items-center justify-center gap-2 rounded-lg border border-dashed border-input text-sm font-medium transition-colors hover:bg-secondary/60"
      >
        <PlusIcon aria-hidden className="size-4" />
        Hire a character
      </Link>
      {/* The URL is only known at request time, so the highlight streams in. */}
      <Suspense fallback={<NavLinkList activePath={null} />}>
        <NavLinks />
      </Suspense>
      <section
        aria-labelledby={crewHeadingId}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <h2
          id={crewHeadingId}
          className="mb-2 px-3 text-xs font-medium tracking-wider text-muted-foreground uppercase"
        >
          Your crew
        </h2>
        <Suspense
          fallback={
            <div className="flex flex-col gap-2 px-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          }
        >
          <CrewList />
        </Suspense>
      </section>
      <Suspense fallback={<Skeleton className="h-16 rounded-lg" />}>
        <UserCard />
      </Suspense>
    </div>
  );
}
