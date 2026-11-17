import {z} from 'zod';

/** Limits shared by every form and by the API. */
export const NAME_MAX_LENGTH = 100;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Every validation message in one place, so the web app, the mobile app and
 * the API show exactly the same words.
 */
export const AUTH_MESSAGES = {
  nameRequired: 'Enter your name.',
  nameTooLong: `Name must be ${NAME_MAX_LENGTH} characters or fewer.`,
  emailInvalid: 'Enter a valid email address.',
  passwordRequired: 'Enter your password.',
  passwordTooShort: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
  passwordTooLong: `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`,
} as const;

// Trim spaces first, then check the email format.
const email = z.string().trim().pipe(z.email(AUTH_MESSAGES.emailInvalid));

/** What a person fills in to create an account. */
export const signUpSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, AUTH_MESSAGES.nameRequired)
    .max(NAME_MAX_LENGTH, AUTH_MESSAGES.nameTooLong),
  email,
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, AUTH_MESSAGES.passwordTooShort)
    .max(PASSWORD_MAX_LENGTH, AUTH_MESSAGES.passwordTooLong),
});

/**
 * What a person fills in to sign in. The password is only checked for being
 * present: length rules apply when it is created, not when it is typed.
 */
export const signInSchema = z.object({
  email,
  password: z.string().min(1, AUTH_MESSAGES.passwordRequired),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
