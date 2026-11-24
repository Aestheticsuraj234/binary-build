'use client';

import type {RunnerAdded, RunnerSummary} from '@binary/shared';
import {cn} from 'cn';
import {
  CheckIcon,
  CopyIcon,
  LaptopIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';
import type {FormEvent} from 'react';
import {useEffect, useState} from 'react';

import {Alert} from '@/components/ui/alert';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Spinner} from '@/components/ui/spinner';
import {ApiError, callApi} from '@/lib/client-api';

/** How often the page checks whether a computer has come online. */
const POLL_MS = 3000;

const STATUS: Record<RunnerSummary['status'], {label: string; dot: string}> = {
  pairing: {label: 'Waiting to pair', dot: 'bg-warning'},
  online: {label: 'Online', dot: 'bg-primary'},
  offline: {label: 'Offline', dot: 'border border-muted-foreground'},
  paused: {label: 'Paused', dot: 'bg-muted-foreground'},
};

function Command({text}: {text: string}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-background py-1.5 pr-1.5 pl-3">
      <code className="min-w-0 flex-1 truncate font-mono text-xs">{text}</code>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={copied ? 'Copied' : 'Copy the command'}
        onClick={() =>
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
      >
        {copied ? <CheckIcon className="text-primary" /> : <CopyIcon />}
      </Button>
    </div>
  );
}

function RunnerCard({
  runner,
  onChanged,
}: {
  runner: RunnerSummary;
  onChanged: (next: RunnerSummary | null) => void;
}) {
  const [busy, setBusy] = useState<'pause' | 'remove'>();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const status = STATUS[runner.status];

  async function togglePause() {
    setBusy('pause');
    setError(undefined);
    try {
      const {runner: next} = await callApi<{runner: RunnerSummary}>(
        `/api/runners/${runner.id}/${runner.status === 'paused' ? 'resume' : 'pause'}`,
        {method: 'POST'},
      );
      onChanged(next);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught));
    } finally {
      setBusy(undefined);
    }
  }

  async function remove() {
    setBusy('remove');
    try {
      await callApi(`/api/runners/${runner.id}`, {method: 'DELETE'});
      onChanged(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught));
      setBusy(undefined);
    }
  }

  return (
    <li className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <div className="flex items-start gap-3">
        <LaptopIcon
          aria-hidden
          className="mt-0.5 size-5 text-muted-foreground"
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{runner.name}</p>
          {runner.os && (
            <p className="text-xs text-muted-foreground">{runner.os}</p>
          )}
        </div>
        <span className="inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs">
          <span aria-hidden className={cn('size-2 rounded-full', status.dot)} />
          {status.label}
        </span>
      </div>
      {runner.folders.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Shared folders</p>
          <ul className="flex flex-col gap-0.5 font-mono text-xs">
            {runner.folders.map(folder => (
              <li key={folder} className="truncate">
                {folder}
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {runner.status !== 'pairing' && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void togglePause()}
            disabled={busy !== undefined}
          >
            {busy === 'pause' ? (
              <Spinner />
            ) : runner.status === 'paused' ? (
              <PlayIcon aria-hidden />
            ) : (
              <PauseIcon aria-hidden />
            )}
            {runner.status === 'paused' ? 'Resume' : 'Pause'}
          </Button>
          {confirming ? (
            <span
              role="alert"
              className="flex flex-wrap items-center gap-2 text-sm"
            >
              <span className="text-muted-foreground">
                Remove {runner.name}? Its token stops working at once.
              </span>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void remove()}
                disabled={busy !== undefined}
              >
                {busy === 'remove' && <Spinner />}
                Remove
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirming(false)}
              >
                Keep it
              </Button>
            </span>
          ) : (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirming(true)}
            >
              <Trash2Icon aria-hidden />
              Remove
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Add a computer (a one-time code and the commands to run), then watch it
 * come online; pause or remove any computer.
 */
export function RunnersPanel({initial}: {initial: RunnerSummary[]}) {
  const [runners, setRunners] = useState(initial);
  const [name, setName] = useState('');
  const [added, setAdded] = useState<RunnerAdded | null>(null);
  const [error, setError] = useState<string>();
  const [isAdding, setIsAdding] = useState(false);
  const waiting =
    added !== null ||
    runners.some(
      runner => runner.status === 'pairing' || runner.status === 'offline',
    );

  // While one is pairing or offline, check now and then if it came online.
  useEffect(() => {
    if (!waiting) {
      return;
    }
    const timer = setInterval(() => {
      callApi<{runners: RunnerSummary[]}>('/api/runners')
        .then(body => setRunners(body.runners))
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting]);

  const pairedNow =
    added && runners.find(runner => runner.id === added.runner.id);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsAdding(true);
    setError(undefined);
    try {
      const result = await callApi<RunnerAdded>('/api/runners', {
        method: 'POST',
        body: {name},
      });
      setAdded(result);
      setRunners(current => [...current, result.runner]);
      setName('');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught));
    } finally {
      setIsAdding(false);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <section
        aria-labelledby="add-heading"
        className="rounded-xl border bg-card p-5"
      >
        <h2 id="add-heading" className="mb-3 font-semibold">
          Add a computer
        </h2>
        <form onSubmit={add} className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-48 flex-1 flex-col gap-2">
            <label htmlFor="runner-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="runner-name"
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="MacBook"
              maxLength={40}
              className="h-10 bg-background"
            />
          </div>
          <Button
            type="submit"
            variant="secondary"
            disabled={isAdding || !name.trim()}
            className="h-10"
          >
            {isAdding ? <Spinner /> : <PlusIcon aria-hidden />}
            Add computer
          </Button>
        </form>
        {error && (
          <Alert
            variant="destructive"
            className="mt-3 border-destructive/40 bg-danger-surface"
          >
            {error}
          </Alert>
        )}
        {added && (
          <div className="mt-5 flex flex-col gap-3 border-t pt-5 text-sm">
            {pairedNow && pairedNow.status !== 'pairing' ? (
              <p className="flex items-center gap-2">
                <CheckIcon aria-hidden className="size-4 text-primary" />
                {pairedNow.name} is paired.
                {pairedNow.status === 'online'
                  ? ' It is online.'
                  : ' Start the Runner with the folders to share, and it shows as Online below.'}
              </p>
            ) : (
              <>
                <p>
                  On <strong>{added.runner.name}</strong>, in this repo, run
                  these two commands. The code works once, for 10 minutes.
                </p>
                <Command text={`pnpm runner pair ${added.code}`} />
              </>
            )}
            <Command text="pnpm runner start --folder ~/code/my-project" />
            <p className="text-muted-foreground">
              Only the folders you pass with{' '}
              <code className="font-mono">--folder</code> are shared. The Runner
              asks Binary for work; nothing on your computer opens to the
              network.
            </p>
          </div>
        )}
      </section>

      <section aria-labelledby="paired-heading">
        <h2 id="paired-heading" className="mb-4 text-2xl font-semibold">
          Paired
        </h2>
        {runners.length === 0 ? (
          <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
            No computers yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {runners.map(runner => (
              <RunnerCard
                key={runner.id}
                runner={runner}
                onChanged={next =>
                  setRunners(current =>
                    next
                      ? current.map(other =>
                          other.id === next.id ? next : other,
                        )
                      : current.filter(other => other.id !== runner.id),
                  )
                }
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
