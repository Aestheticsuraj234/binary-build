import {headers} from 'next/headers';
import Link from 'next/link';
import {Suspense} from 'react';

import {Logo} from '@/components/logo';
import {NavLinks} from '@/components/nav-links';
import {SignOutButton} from '@/components/sign-out-button';
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

/** The signed-in person's initials and email. Reads the session, so it streams in. */
async function CurrentUser() {
  const user = await getSessionUser((await headers()).get('cookie'));
  if (!user) {
    return null;
  }

  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className="flex size-8 items-center justify-center rounded-full border border-input bg-secondary text-xs text-muted-foreground"
      >
        {initialsOf(user.name, user.email)}
      </span>
      <span className="hidden text-sm md:inline">{user.email}</span>
    </div>
  );
}

/** The top bar shared by every signed-in page. */
export function AppHeader() {
  return (
    <header className="border-b">
      <div className="flex h-16 items-center gap-4 px-4 sm:gap-8 sm:px-6">
        <Link href="/" aria-label="Binary home">
          <Logo />
        </Link>
        <NavLinks />
        <div className="ml-auto flex items-center gap-2 sm:gap-4">
          <Suspense fallback={null}>
            <CurrentUser />
          </Suspense>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
