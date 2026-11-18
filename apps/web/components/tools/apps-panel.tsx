'use client';

import type {AppWithTools} from '@binary/shared';
import {connectAppSchema, validate} from '@binary/shared';
import {
  LockIcon,
  PlugIcon,
  RotateCwIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import type {FormEvent} from 'react';
import {useState} from 'react';

import {FormField} from '@/components/form-field';
import {ToolList} from '@/components/tools/risk-badge';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Spinner} from '@/components/ui/spinner';
import {ApiError, callApi} from '@/lib/client-api';

type FieldErrors = Partial<Record<'name' | 'url' | 'authorization', string>>;

/** "https://mcp.composio.dev/abc/xyz" becomes "mcp.composio.dev/abc/xyz". */
function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  } catch {
    return url;
  }
}

/** Paste an MCP server URL (and token) to connect an app. */
function ConnectAppForm({
  onConnected,
}: {
  onConnected: (app: AppWithTools) => void;
}) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [isBusy, setIsBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const result = validate(connectAppSchema, {
      name: data.get('name'),
      url: data.get('url'),
      authorization: data.get('authorization'),
    });
    if (!result.success) {
      setErrors(result.errors);
      setFormError(undefined);
      return;
    }
    setErrors({});
    setFormError(undefined);
    setIsBusy(true);
    try {
      onConnected(
        await callApi<AppWithTools>('/api/apps', {
          method: 'POST',
          body: result.data,
        }),
      );
      form.reset();
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'Something went wrong.',
      );
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <form
      onSubmit={event => void handleSubmit(event)}
      noValidate
      className="rounded-lg border bg-card p-5"
    >
      <h3 className="font-semibold">Connect an app</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Paste any MCP server URL. For Gmail, GitHub, Slack and other everyday
        apps, use the Composio section below.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <FormField
          name="name"
          label="Name"
          placeholder="Gmail"
          autoComplete="off"
          error={errors.name}
        />
        <FormField
          name="url"
          label="MCP server URL"
          placeholder="https://mcp.composio.dev/…"
          inputMode="url"
          autoComplete="off"
          error={errors.url}
        />
      </div>
      <div className="mt-4">
        <FormField
          name="authorization"
          label="Authorization header (optional)"
          placeholder="Bearer …"
          type="password"
          autoComplete="off"
          error={errors.authorization}
        />
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <LockIcon aria-hidden className="size-3.5 shrink-0 text-primary" />
          Encrypted before it&apos;s stored, like your API keys. Put secrets
          here, not in the URL.
        </p>
      </div>
      {formError && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-destructive/40 bg-danger-surface p-3 text-sm text-destructive"
        >
          {formError}
        </p>
      )}
      <Button type="submit" size="lg" disabled={isBusy} className="mt-5">
        {isBusy ? <Spinner /> : <PlugIcon aria-hidden />}
        {isBusy ? 'Connecting…' : 'Connect'}
      </Button>
    </form>
  );
}

/** One connected app: its tools, or why it can't be reached. */
function AppCard({
  initial,
  onRemoved,
}: {
  initial: AppWithTools;
  onRemoved: (id: string) => void;
}) {
  const [entry, setEntry] = useState(initial);
  const [busy, setBusy] = useState<'retry' | 'remove'>();
  const {app, tools, error} = entry;

  async function retry() {
    setBusy('retry');
    try {
      setEntry(await callApi<AppWithTools>(`/api/apps/${app.id}`));
    } catch (caught) {
      setEntry({
        ...entry,
        error: caught instanceof Error ? caught.message : String(caught),
      });
    } finally {
      setBusy(undefined);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove ${app.name}? Your agents lose its tools.`)) {
      return;
    }
    setBusy('remove');
    try {
      await callApi(`/api/apps/${app.id}`, {method: 'DELETE'});
      onRemoved(app.id);
    } catch (caught) {
      setBusy(undefined);
      window.alert(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <section
      aria-labelledby={`app-${app.id}`}
      className="rounded-lg border bg-card p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={`app-${app.id}`} className="font-semibold">
              {app.name}
            </h3>
            {error ? (
              <Badge className="border-destructive/50 text-destructive">
                Can&apos;t reach
              </Badge>
            ) : (
              <Badge>Connected</Badge>
            )}
          </div>
          <p className="mt-1 flex items-center gap-1.5 font-mono text-xs break-all text-muted-foreground">
            {shortUrl(app.url)}
            {app.hasAuthorization && (
              <LockIcon
                aria-label="Token saved, encrypted"
                className="size-3 shrink-0"
              />
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {error && (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy !== undefined}
              onClick={() => void retry()}
            >
              {busy === 'retry' ? <Spinner /> : <RotateCwIcon aria-hidden />}
              Try again
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={busy !== undefined}
            onClick={() => void remove()}
          >
            Remove
          </Button>
        </div>
      </div>
      <div className="mt-4">
        {error ? (
          <p
            role="alert"
            className="flex gap-2 rounded-md border border-destructive/40 bg-danger-surface p-3 text-sm text-destructive"
          >
            <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              {error} Your agents can still chat; they just can&apos;t use{' '}
              {app.name} until it answers.
            </span>
          </p>
        ) : tools.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This app has no tools.
          </p>
        ) : (
          <ToolList tools={tools} />
        )}
      </div>
    </section>
  );
}

/** "Connected apps": the connect form, then each app with its tools. */
export function AppsPanel({initialApps}: {initialApps: AppWithTools[]}) {
  const [apps, setApps] = useState(initialApps);
  return (
    <div className="flex flex-col gap-4">
      <ConnectAppForm
        onConnected={app => setApps(current => [...current, app])}
      />
      {apps.map(entry => (
        <AppCard
          key={entry.app.id}
          initial={entry}
          onRemoved={id =>
            setApps(current => current.filter(other => other.app.id !== id))
          }
        />
      ))}
    </div>
  );
}
