import type {
  RunnerEvent,
  RunnerHello,
  RunnerJobEnvelope,
  RunnerResult,
} from '@binary/shared';

/** The API refused this Runner's token (removed, or never paired). */
export class NotPairedError extends Error {}

/**
 * Talks to Binary's API. The Runner only ever calls out; nothing on this
 * computer listens for connections.
 */
export class ApiClient {
  constructor(
    readonly apiUrl: string,
    private readonly token: string | null = null,
  ) {}

  private async post<T>(
    path: string,
    body: unknown,
    timeoutMs = 60_000,
  ): Promise<T> {
    const response = await fetch(
      `${this.apiUrl.replace(/\/$/, '')}/api/runner${path}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.token ? {authorization: `Bearer ${this.token}`} : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
    const json = (await response.json().catch(() => ({}))) as T & {
      message?: string;
    };
    if (response.status === 401) {
      throw new NotPairedError(json.message ?? 'This Runner is not paired.');
    }
    if (!response.ok) {
      throw new Error(json.message ?? `The API answered ${response.status}.`);
    }
    return json;
  }

  pair(code: string) {
    return this.post<{token: string; runnerId: string; name: string}>('/pair', {
      code,
    });
  }

  hello(hello: RunnerHello) {
    return this.post<{name: string; paused: boolean}>('/hello', hello);
  }

  /** The long poll: waits up to ~25 s for a job. */
  next() {
    return this.post<{
      job: RunnerJobEnvelope | null;
      paused: boolean;
      message?: string;
    }>('/jobs/next', {}, 40_000);
  }

  events(jobId: string, events: RunnerEvent[]) {
    return this.post<{ok: true}>(`/jobs/${jobId}/events`, {events});
  }

  result(jobId: string, result: RunnerResult) {
    return this.post<{ok: true}>(`/jobs/${jobId}/result`, result);
  }
}
