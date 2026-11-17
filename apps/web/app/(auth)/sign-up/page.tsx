import type {Metadata} from 'next';

import {AuthForm} from '@/components/auth-form';

export const metadata: Metadata = {title: 'Create account · Binary'};

export default function SignUpPage() {
  return (
    <>
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create your account
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Binary runs on your machine. Your account stays here too.
        </p>
      </header>
      <AuthForm mode="sign-up" />
    </>
  );
}
