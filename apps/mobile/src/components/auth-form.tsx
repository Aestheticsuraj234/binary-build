import type {FieldErrors, SignUpInput} from '@binary/shared';
import {
  colors,
  fontSize,
  fontWeight,
  radius,
  signInSchema,
  signUpSchema,
  spacing,
  validate,
} from '@binary/shared';
import {Link} from 'expo-router';
import {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {Button} from '@/components/button';
import {TextField} from '@/components/text-field';
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
  values: Record<string, string>,
): Promise<{fieldErrors?: FieldErrors<SignUpInput>; formError?: string}> {
  try {
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
  } catch {
    // Usually the phone cannot reach the API (different Wi-Fi, API stopped).
    return {formError: 'Could not reach Binary. Is the API running?'};
  }
}

/**
 * The sign-in and sign-up form. After a successful submit the session
 * changes, and the root layout moves the person to the home screen.
 */
export function AuthForm({mode}: AuthFormProps) {
  const [values, setValues] = useState({name: '', email: '', password: ''});
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<SignUpInput>>({});
  const [formError, setFormError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const copy = COPY[mode];

  function setValue(field: keyof typeof values, value: string) {
    setValues(current => ({...current, [field]: value}));
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    const outcome = await submitAuthForm(mode, values);
    setFieldErrors(outcome.fieldErrors ?? {});
    setFormError(outcome.formError);
    setIsSubmitting(false);
  }

  return (
    <View style={styles.form}>
      {formError ? (
        <View accessibilityRole="alert" style={styles.alert}>
          <Text style={styles.alertText}>{formError}</Text>
        </View>
      ) : null}

      {mode === 'sign-up' && (
        <TextField
          label="Name"
          value={values.name}
          onChangeText={value => setValue('name', value)}
          autoComplete="name"
          textContentType="name"
          error={fieldErrors.name}
        />
      )}
      <TextField
        label="Email"
        value={values.email}
        onChangeText={value => setValue('email', value)}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        error={fieldErrors.email}
      />
      <TextField
        label="Password"
        value={values.password}
        onChangeText={value => setValue('password', value)}
        secureTextEntry
        autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
        textContentType={mode === 'sign-up' ? 'newPassword' : 'password'}
        error={fieldErrors.password}
        onSubmitEditing={handleSubmit}
      />

      <Button
        label={copy.submit}
        onPress={handleSubmit}
        isLoading={isSubmitting}
      />

      <Text style={styles.switchText}>
        {copy.switchPrompt}{' '}
        <Link href={copy.switchHref} replace style={styles.switchLink}>
          {copy.switchLink}
        </Link>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  form: {gap: spacing.lg},
  alert: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSurface,
    padding: spacing.md,
  },
  alertText: {color: colors.danger, fontSize: fontSize.sm},
  switchText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  switchLink: {color: colors.text, fontWeight: fontWeight.semibold},
});
