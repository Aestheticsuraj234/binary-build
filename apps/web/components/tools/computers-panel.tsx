'use client';

import type {ComputersOverview, ComputerSummary} from '@binary/shared';
import {BROWSER_SETUP_HINT, SANDBOX_SETUP_HINT} from '@binary/shared';
import {
  GlobeIcon,
  MessageSquareIcon,
  SquareIcon,
  TerminalIcon,
} from 'lucide-react';
import Link from 'next/link';
import {useState} from 'react';

import {CharacterFace} from '@/components/characters/character-face';
import {Button} from '@/components/ui/button';
import {Spinner} from '@/components/ui/spinner';
import {ApiError, callApi} from '@/lib/client-api';

function ComputerRow({
  computer,
  onStopped,
}: {
  computer: ComputerSummary;
  onStopped: () => void;
}) {
  const [isStopping, setIsStopping] = useState(false);
  const [error, setError] = useState<string>();
  const isBrowser = computer.kind === 'browser';
  const stopsAt = new Date(computer.expiresAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
  const Icon = isBrowser ? GlobeIcon : TerminalIcon;

  async function stop() {
    setIsStopping(true);
    setError(undefined);
    try {
      await callApi(`/api/computers/${computer.id}/stop`, {method: 'POST'});
      onStopped();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught));
      setIsStopping(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
      <CharacterFace character={computer.avatar} size={36} animated={false} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-sm font-medium">
          <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          {isBrowser ? 'Browser' : 'Cloud sandbox'} ·{' '}
          {computer.threadTitle ?? 'Untitled chat'}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {computer.agentName}
          {computer.url ? ` · ${computer.url}` : ''} · closes by itself at{' '}
          {stopsAt} unless it&apos;s used again
        </p>
        {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
      </div>
      <Link
        href={`/chats/${computer.threadId}`}
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
        {isBrowser ? 'Close' : 'Stop'}
      </Button>
    </li>
  );
}

/** Every running computer, sandboxes and browsers, with Stop. */
export function ComputersPanel({initial}: {initial: ComputersOverview}) {
  const [computers, setComputers] = useState(initial.computers);
  const {sandbox, browser} = initial;

  return (
    <div className="flex flex-col gap-3">
      <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
        <li className="rounded-lg border bg-card p-4">
          <span className="font-medium text-foreground">Cloud sandbox</span>
          <span className="mt-1 block">
            {sandbox.available
              ? `A private Linux machine per chat, from E2B. Stops after ${sandbox.idleMinutes} idle minutes, with its files.`
              : SANDBOX_SETUP_HINT}
          </span>
        </li>
        <li className="rounded-lg border bg-card p-4">
          <span className="font-medium text-foreground">Browser</span>
          <span className="mt-1 block">
            {browser.available
              ? `A headless Chromium per chat, on this machine, that only reaches public addresses. Closes after ${browser.idleMinutes} idle minutes; at most ${browser.maxOpen} open.`
              : BROWSER_SETUP_HINT}
          </span>
        </li>
      </ul>
      {computers.length === 0 ? (
        <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
          Nothing is running.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {computers.map(computer => (
            <ComputerRow
              key={computer.id}
              computer={computer}
              onStopped={() =>
                setComputers(current =>
                  current.filter(other => other.id !== computer.id),
                )
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}
