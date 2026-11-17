import type {Metadata} from 'next';

import {AuthForm} from '@/components/auth-form';

export const metadata: Metadata = {title: 'Sign in · Binary'};

export default function SignInPage() {
  return (
    <>
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in to talk to your AI coworkers.
        </p>
      </header>
      <AuthForm mode="sign-in" />
    </>
  );
}
