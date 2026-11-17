'use client';

import {LogOutIcon} from 'lucide-react';
import {useRouter} from 'next/navigation';
import {useState} from 'react';

import {Button} from '@/components/ui/button';
import {Spinner} from '@/components/ui/spinner';
import {authClient} from '@/lib/auth-client';

/** Ends the session and returns to the sign-in page. */
export function SignOutButton() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleClick() {
    setIsSigningOut(true);
    await authClient.signOut();
    router.replace('/sign-in');
    router.refresh();
  }

  return (
    <Button variant="ghost" onClick={handleClick} disabled={isSigningOut}>
      {isSigningOut ? <Spinner /> : <LogOutIcon aria-hidden />}
      <span className="hidden sm:inline">Sign out</span>
    </Button>
  );
}
