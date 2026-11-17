'use client';

import {LogOutIcon} from 'lucide-react';
import {useRouter} from 'next/navigation';
import {useState} from 'react';

import {Button} from '@/components/ui/button';
import {Spinner} from '@/components/ui/spinner';
import {authClient} from '@/lib/auth-client';

/** Ends the session and returns to the sign-in page. */
export function SignOutButton({iconOnly = false}: {iconOnly?: boolean}) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleClick() {
    setIsSigningOut(true);
    await authClient.signOut();
    router.replace('/sign-in');
    router.refresh();
  }

  return (
    <Button
      variant="ghost"
      size={iconOnly ? 'icon' : 'default'}
      onClick={handleClick}
      disabled={isSigningOut}
      aria-label={iconOnly ? 'Sign out' : undefined}
      title={iconOnly ? 'Sign out' : undefined}
    >
      {isSigningOut ? <Spinner /> : <LogOutIcon aria-hidden />}
      {!iconOnly && 'Sign out'}
    </Button>
  );
}
