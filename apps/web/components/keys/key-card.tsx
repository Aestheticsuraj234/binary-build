'use client';

import type {ProviderKeyStatus} from '@binary/shared';
import {getProvider, saveKeySchema, validate} from '@binary/shared';
import {ExternalLinkIcon} from 'lucide-react';
import type {FormEvent} from 'react';
import {useState} from 'react';

import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Spinner} from '@/components/ui/spinner';
import {ApiError, callApi} from '@/lib/client-api';

interface KeyCardProps {
  initialStatus: ProviderKeyStatus;
}

/** "2026-11-17T09:53:31Z" becomes "Nov 17, 2026". */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * One provider on the API keys page: add, replace or remove its key.
 * The key is sent to the API once and never comes back; afterwards only
 * its last 4 characters are shown.
 */
export function KeyCard({initialStatus}: KeyCardProps) {
  const [status, setStatus] = useState(initialStatus);
  const [isEditing, setIsEditing] = useState(!initialStatus.connected);
  const [error, setError] = useState<string>();
  const [busyAction, setBusyAction] = useState<'save' | 'remove'>();
  const provider = getProvider(status.provider);
  const inputId = `key-${provider.id}`;

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const result = validate(saveKeySchema, {
      key: new FormData(form).get('key'),
    });
    if (!result.success) {
      setError(result.firstError);
      return;
    }

    setBusyAction('save');
    setError(undefined);
    try {
      const body = await callApi<{key: ProviderKeyStatus}>(
        `/api/keys/${provider.id}`,
        {method: 'PUT', body: result.data},
      );
      setStatus(body.key);
      setIsEditing(false);
      form.reset();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught));
    } finally {
      setBusyAction(undefined);
    }
  }

  async function handleRemove() {
    setBusyAction('remove');
    setError(undefined);
    try {
      const body = await callApi<{key: ProviderKeyStatus}>(
        `/api/keys/${provider.id}`,
        {method: 'DELETE'},
      );
      setStatus(body.key);
      setIsEditing(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught));
    } finally {
      setBusyAction(undefined);
    }
  }

  return (
    <section
      aria-labelledby={`${inputId}-title`}
      className="rounded-lg border bg-card p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={`${inputId}-title`} className="font-semibold">
            {provider.name}
          </h2>
          <a
            href={provider.keysUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Get a key
            <ExternalLinkIcon aria-hidden className="size-3.5" />
          </a>
        </div>
        {status.connected ? (
          <Badge className="border-primary/40 text-foreground">
            <span aria-hidden className="size-1.5 rounded-full bg-primary" />
            Added
          </Badge>
        ) : (
          <Badge>Not added</Badge>
        )}
      </div>

      {status.connected && !isEditing && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Key ending in{' '}
            <span className="font-mono text-foreground">
              ••••{status.last4}
            </span>
            {status.updatedAt && <> · saved {formatDate(status.updatedAt)}</>}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setIsEditing(true)}
              disabled={busyAction !== undefined}
            >
              Replace
            </Button>
            <Button
              variant="ghost"
              onClick={handleRemove}
              disabled={busyAction !== undefined}
              className="text-destructive hover:bg-danger-surface hover:text-destructive"
            >
              {busyAction === 'remove' && <Spinner />}
              Remove
            </Button>
          </div>
        </div>
      )}

      {isEditing && (
        <form onSubmit={handleSave} noValidate className="mt-6">
          <label htmlFor={inputId} className="sr-only">
            {provider.name} API key
          </label>
          <div className="flex gap-2">
            <Input
              id={inputId}
              name="key"
              type="password"
              placeholder={
                status.connected ? 'Paste your new key' : 'Paste your key'
              }
              autoComplete="off"
              spellCheck={false}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${inputId}-error` : undefined}
              className="h-10 bg-background"
            />
            <Button
              type="submit"
              variant="secondary"
              className="h-10 px-4"
              disabled={busyAction !== undefined}
            >
              {busyAction === 'save' && <Spinner />}
              Save
            </Button>
            {status.connected && (
              <Button
                type="button"
                variant="ghost"
                className="h-10"
                onClick={() => {
                  setIsEditing(false);
                  setError(undefined);
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      )}

      {error && (
        <p
          id={`${inputId}-error`}
          role="alert"
          className="mt-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}
    </section>
  );
}
