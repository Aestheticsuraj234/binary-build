'use client';

import type {FieldErrors, SignUpInput} from '@binary/shared';
import {signInSchema, signUpSchema, validate} from '@binary/shared';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import type {FormEvent} from 'react';
import {useState} from 'react';

import {FormField} from '@/components/form-field';
import {Alert} from '@/components/ui/alert';
import {Button} from '@/components/ui/button';
import {Spinner} from '@/components/ui/spinner';
import {authClient} from '@/lib/auth-client';

interface AuthFormProps {
  mode: 'sign-in' | 'sign-up';
}

/** Text that changes between the two forms. */
const COPY = {
  'sign-in': {
    submit: 'Sign in',
    switchPrompt: 'New to Binary?',
    switchLink: 'Create an account',
    switchHref: '/sign-up',
  },
  'sign-up': {
    submit: 'Create account',
    switchPrompt: 'Already have an account?',
    switchLink: 'Sign in',
    switchHref: '/sign-in',
  },
} as const;

const GENERIC_ERROR = 'Something went wrong. Please try again.';

/** Checks the form with the shared rules, then calls Better Auth. */
async function submitAuthForm(
  mode: AuthFormProps['mode'],
  values: Record<string, unknown>,
): Promise<{fieldErrors?: FieldErrors<SignUpInput>; formError?: string}> {
  if (mode === 'sign-up') {
    const result = validate(signUpSchema, values);
    if (!result.success) {
      return {fieldErrors: result.errors};
    }
    const {error} = await authClient.signUp.email(result.data);
    return error ? {formError: error.message ?? GENERIC_ERROR} : {};
  }

  const result = validate(signInSchema, values);
  if (!result.success) {
    return {fieldErrors: result.errors};
  }
  const {error} = await authClient.signIn.email(result.data);
  return error ? {formError: error.message ?? GENERIC_ERROR} : {};
}

/** The sign-in and sign-up form. */
export function AuthForm({mode}: AuthFormProps) {
  const router = useRouter();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<SignUpInput>>({});
  const [formError, setFormError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const copy = COPY[mode];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));

    const outcome = await submitAuthForm(mode, values);
    setFieldErrors(outcome.fieldErrors ?? {});
    setFormError(outcome.formError);

    if (outcome.fieldErrors || outcome.formError) {
      setIsSubmitting(false);
      return;
    }
    router.replace('/');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {formError && (
        <Alert
          variant="destructive"
          className="border-destructive/40 bg-danger-surface"
        >
          {formError}
        </Alert>
      )}

      {mode === 'sign-up' && (
        <FormField
          name="name"
          label="Name"
          autoComplete="name"
          error={fieldErrors.name}
        />
      )}
      <FormField
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        error={fieldErrors.email}
      />
      <FormField
        name="password"
        label="Password"
        type="password"
        autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
        error={fieldErrors.password}
      />

      <Button
        type="submit"
        size="lg"
        disabled={isSubmitting}
        className="mt-1 h-11"
      >
        {isSubmitting && <Spinner />}
        {copy.submit}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {copy.switchPrompt}{' '}
        <Link
          href={copy.switchHref}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {copy.switchLink}
        </Link>
      </p>
    </form>
  );
}
