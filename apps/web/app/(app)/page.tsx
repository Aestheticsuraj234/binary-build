import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {Suspense} from 'react';

import {Logo} from '@/components/logo';
import {SignOutButton} from '@/components/sign-out-button';
import {Spinner} from '@/components/ui/spinner';
import {getSessionUser} from '@/lib/session';

/** Greets the signed-in person. Reads the session, so it streams in. */
async function Greeting() {
  const user = await getSessionUser((await headers()).get('cookie'));
  if (!user) {
    // The proxy normally catches this first; this covers a session that
    // expired between the two checks.
    redirect('/sign-in');
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        Hi, {user.name.split(' ')[0]}
      </h1>
      <p className="mt-2 text-muted-foreground">
        You&apos;re signed in as {user.email}. Your AI coworkers will live here.
      </p>
    </>
  );
}

export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4">
      <header className="flex items-center justify-between py-6">
        <Logo />
        <SignOutButton />
      </header>
      <main className="flex flex-1 flex-col justify-center pb-24">
        <Suspense fallback={<Spinner className="size-5" />}>
          <Greeting />
        </Suspense>
      </main>
    </div>
  );
}
