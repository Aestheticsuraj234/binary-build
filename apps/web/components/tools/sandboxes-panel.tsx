'use client';

import type {SandboxesOverview, SandboxSummary} from '@binary/shared';
import {SANDBOX_SETUP_HINT} from '@binary/shared';
import {MessageSquareIcon, SquareIcon} from 'lucide-react';
import Link from 'next/link';
import {useState} from 'react';

import {CharacterFace} from '@/components/characters/character-face';
import {Button} from '@/components/ui/button';
import {Spinner} from '@/components/ui/spinner';
import {ApiError, callApi} from '@/lib/client-api';

function SandboxRow({
  sandbox,
  onStopped,
}: {
  sandbox: SandboxSummary;
  onStopped: () => void;
}) {
  const [isStopping, setIsStopping] = useState(false);
  const [error, setError] = useState<string>();
  const stopsAt = new Date(sandbox.expiresAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  async function stop() {
    setIsStopping(true);
    setError(undefined);
    try {
      await callApi(`/api/sandboxes/${sandbox.id}/stop`, {method: 'POST'});
      onStopped();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught));
      setIsStopping(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
      <CharacterFace character={sandbox.avatar} size={36} animated={false} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {sandbox.threadTitle ?? 'Untitled chat'}
        </p>
        <p className="text-xs text-muted-foreground">
          {sandbox.agentName} · stops by itself at {stopsAt} unless it&apos;s
          used again
        </p>
        {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
      </div>
      <Link
        href={`/chats/${sandbox.threadId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <MessageSquareIcon aria-hidden className="size-4" />
        Chat
      </Link>
      <Button
        type="button"
        variant="secondary"
        onClick={() => void stop()}
        disabled={isStopping}
      >
        {isStopping ? <Spinner /> : <SquareIcon aria-hidden />}
        Stop
      </Button>
    </li>
  );
}

/** Running cloud sandboxes with Stop, or how to turn them on. */
export function SandboxesPanel({initial}: {initial: SandboxesOverview}) {
  const [sandboxes, setSandboxes] = useState(initial.sandboxes);

  if (!initial.available) {
    return (
      <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
        {SANDBOX_SETUP_HINT} Then give a character a cloud sandbox under Edit →
        Computer.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Each chat with a sandbox character gets its own private Linux machine
        from E2B. It starts on the first approved run and stops after{' '}
        {initial.idleMinutes} idle minutes, taking its files with it.
      </p>
      {sandboxes.length === 0 ? (
        <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
          No sandbox is running.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sandboxes.map(sandbox => (
            <SandboxRow
              key={sandbox.id}
              sandbox={sandbox}
              onStopped={() =>
                setSandboxes(current =>
                  current.filter(other => other.id !== sandbox.id),
                )
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}
