/** An error the API sent back, with a message that is safe to show. */
export class ApiError extends Error {
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

/**
 * Calls the API from the browser (through the web app's /api forwarding)
 * and returns the JSON body. Throws `ApiError` with the API's own message
 * when the request fails.
 */
export async function callApi<T>(
  path: string,
  options: {method?: string; body?: unknown} = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      headers:
        options.body === undefined
          ? undefined
          : {'content-type': 'application/json'},
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError('Could not reach Binary. Is the API running?');
  }

  const body = (await response.json().catch(() => null)) as
    (T & {code?: string; message?: string}) | null;
  if (!response.ok) {
    throw new ApiError(
      body?.message ?? 'Something went wrong. Please try again.',
      body?.code,
    );
  }
  return body as T;
}
