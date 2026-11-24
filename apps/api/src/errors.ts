import type {ApiErrorCode, FieldErrors} from '@binary/shared';
import {API_ERROR_CODES, validate} from '@binary/shared';
import type {Context} from 'hono';
import {HTTPException} from 'hono/http-exception';
import type {ContentfulStatusCode} from 'hono/utils/http-status';
import {z} from 'zod';

/**
 * An error with a message that is safe to show and the HTTP status it
 * stands for. Routes throw these; `handleError` turns them into
 * `{code, message}` JSON. Anything else becomes a plain 500.
 */
export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: ContentfulStatusCode;

  constructor(
    code: ApiErrorCode,
    status: ContentfulStatusCode,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
  }

  /** The JSON body sent for this error. */
  toJSON(): Record<string, unknown> {
    return {code: this.code, message: this.message};
  }
}

/** 404. Also used for things that belong to someone else. */
export class NotFoundError extends AppError {
  constructor(what: string) {
    super(API_ERROR_CODES.notFound, 404, `There is no ${what} here.`);
  }
}

/** 400, with a message for each field that's wrong. */
export class InvalidInputError extends AppError {
  readonly fieldErrors: FieldErrors<Record<string, unknown>>;

  constructor(
    message: string,
    fieldErrors: FieldErrors<Record<string, unknown>> = {},
    code: ApiErrorCode = API_ERROR_CODES.invalidInput,
  ) {
    super(code, 400, message);
    this.fieldErrors = fieldErrors;
  }

  override toJSON() {
    return {...super.toJSON(), fieldErrors: this.fieldErrors};
  }
}

/** 409: the request is fine, but something has to change first. */
export class ConflictError extends AppError {
  constructor(message: string, code: ApiErrorCode = API_ERROR_CODES.conflict) {
    super(code, 409, message);
  }
}

/** 409: the provider key this needs isn't saved, or can't be read. */
export class NoKeyError extends ConflictError {
  constructor(message: string) {
    super(message, API_ERROR_CODES.noKey);
  }
}

/** 400: a URL points somewhere Binary won't go, like your own network. */
export class UnsafeUrlError extends AppError {
  constructor(message = 'Binary only opens public web addresses.') {
    super(API_ERROR_CODES.unsafeUrl, 400, message);
  }
}

/** 502: an MCP app didn't answer, or refused the connection. */
export class AppUnreachableError extends AppError {
  constructor(message: string) {
    super(API_ERROR_CODES.appUnreachable, 502, message);
  }
}

/** 401: a webhook without the right secret. */
export class UnauthorizedError extends AppError {
  constructor(message: string) {
    super(API_ERROR_CODES.unauthorized, 401, message);
  }
}

/** 413: a request body over the limit. */
export class TooLargeError extends AppError {
  constructor(message: string) {
    super(API_ERROR_CODES.tooLarge, 413, message);
  }
}

/** 502: the job runner (Trigger.dev) couldn't take the job. */
export class JobsUnavailableError extends AppError {
  constructor(message: string) {
    super(API_ERROR_CODES.jobsUnavailable, 502, message);
  }
}

/** Hono's `onError`: typed errors become clean JSON, the rest a 500. */
export function handleError(error: Error, c: Context): Response {
  if (error instanceof AppError) {
    return c.json(error.toJSON(), error.status);
  }
  // Hono's own refusals, like the CSRF check's 403, keep their response.
  if (error instanceof HTTPException) {
    return error.getResponse();
  }
  console.error('[api] unexpected error:', error);
  return c.json(
    {code: 'INTERNAL', message: 'Something went wrong on our side.'},
    500,
  );
}

/** Reads a JSON body and checks it, or throws `InvalidInputError`. */
export async function readJson<T>(
  c: Context,
  schema: z.ZodType<T>,
): Promise<T> {
  const result = validate(schema, await c.req.json().catch(() => null));
  if (!result.success) {
    throw new InvalidInputError(result.firstError, result.errors);
  }
  return result.data;
}

const idSchema = z.uuid();

/**
 * The `:id` from the URL. An id that isn't even valid gets the same 404 as
 * one that doesn't exist.
 */
export function idParam(c: Context, what: string): string {
  const id = idSchema.safeParse(c.req.param('id'));
  if (!id.success) {
    throw new NotFoundError(what);
  }
  return id.data;
}
