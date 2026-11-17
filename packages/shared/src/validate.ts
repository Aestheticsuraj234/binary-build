import type {z} from 'zod';

/** One error message per form field, keyed by the field's name. */
export type FieldErrors<T> = Partial<Record<keyof T, string>>;

/** The outcome of checking form input against a schema. */
export type ValidationResult<T> =
  | {success: true; data: T}
  | {success: false; errors: FieldErrors<T>; firstError: string};

/**
 * Checks `input` against `schema`.
 *
 * On failure it returns the first message for each field (for showing under
 * inputs) and the very first message overall (for a single error banner).
 */
export function validate<T>(
  schema: z.ZodType<T>,
  input: unknown,
): ValidationResult<T> {
  const result = schema.safeParse(input);
  if (result.success) {
    return {success: true, data: result.data};
  }

  const errors: FieldErrors<T> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof T | undefined;
    if (field !== undefined && errors[field] === undefined) {
      errors[field] = issue.message;
    }
  }
  const firstError = result.error.issues[0]?.message ?? 'Invalid input.';
  return {success: false, errors, firstError};
}
