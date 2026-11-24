'use client';

import type {
  AgentSummary,
  RoutineDetail,
  RoutineRun,
  RoutineSaved,
} from '@binary/shared';
import {characterOf, describeSchedule} from '@binary/shared';
import {ArrowLeftIcon} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useCallback, useEffect, useRef, useState} from 'react';

import {CharacterFace} from '@/components/characters/character-face';
import {RoutineForm} from '@/components/routines/routine-form';
import {RunHistory} from '@/components/routines/run-history';
import {
  SecretReveal,
  WebhookDetails,
} from '@/components/routines/webhook-details';
import {Button} from '@/components/ui/button';
import {Spinner} from '@/components/ui/spinner';
import {ApiError, callApi} from '@/lib/client-api';

/** How often the page checks on runs that haven't finished. */
const POLL_MS = 1500;

const isActive = (run: RoutineRun) =>
  run.status === 'queued' || run.status === 'running';

/** The "Run by Sunny · Weekdays at 9:00 (Asia/Calcutta)" line. */
function summaryLine(detail: RoutineDetail): string {
  const {routine, timeZone} = detail;
  const parts = [`Run by ${routine.agentName}`];
  if (routine.cron) {
    parts.push(
      `${describeSchedule(routine.cron)}${timeZone ? ` (${timeZone})` : ''}`,
    );
  }
  if (!routine.enabled) {
    parts.push('Switched off');
  }
  return parts.join(' · ');
}

/** Asks once, then deletes the routine and its run history. */
function DeleteRoutine({id, name}: {id: string; name: string}) {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function remove() {
    setIsBusy(true);
    try {
      await callApi(`/api/routines/${id}`, {method: 'DELETE'});
      router.push('/routines');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught));
      setIsBusy(false);
    }
  }

  if (!isConfirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        className="self-start text-destructive hover:bg-danger-surface hover:text-destructive"
        onClick={() => setIsConfirming(true)}
      >
        Delete routine
      </Button>
    );
  }
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">
        {error ??
          `Delete ${name}? Its schedule and webhook stop; transcripts stay in your chats.`}
      </span>
      <Button
        type="button"
        variant="destructive"
        onClick={() => void remove()}
        disabled={isBusy}
      >
        {isBusy && <Spinner />}
        Delete
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={() => setIsConfirming(false)}
      >
        Keep it
      </Button>
    </div>
  );
}

/**
 * One routine: edit it, see its webhook, and follow its runs. While a run
 * is queued or running, the page checks on it every 1.5 seconds.
 */
export function RoutineEditor({
  initial,
  agents,
}: {
  initial: RoutineDetail;
  agents: AgentSummary[];
}) {
  const router = useRouter();
  const [detail, setDetail] = useState(initial);
  const [secret, setSecret] = useState<string | null>(null);
  const {routine} = detail;
  const hasActiveRun = detail.runs.some(isActive);
  const wasActive = useRef(hasActiveRun);

  const reload = useCallback(async () => {
    try {
      setDetail(
        await callApi<RoutineDetail>(`/api/routines/${initial.routine.id}`),
      );
    } catch {
      // A missed check is fine; the next one catches up.
    }
  }, [initial.routine.id]);

  useEffect(() => {
    if (!hasActiveRun) {
      if (wasActive.current) {
        // A run just finished: its transcript is new in Recent chats.
        router.refresh();
      }
      wasActive.current = false;
      return;
    }
    wasActive.current = true;
    const timer = setInterval(() => void reload(), POLL_MS);
    return () => clearInterval(timer);
  }, [hasActiveRun, reload, router]);

  function saved(result: RoutineSaved) {
    if (result.webhookSecret) {
      setSecret(result.webhookSecret);
    } else if (!result.routine.webhook) {
      setSecret(null);
    }
    void reload();
    router.refresh();
  }

  const character = characterOf(routine.avatar);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:py-16">
      <Link
        href="/routines"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon aria-hidden className="size-4" />
        Routines
      </Link>
      <header className="mb-8 flex items-center gap-4">
        <CharacterFace character={character.id} size={64} animated={false} />
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-semibold tracking-tight sm:text-4xl">
            {routine.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {summaryLine(detail)}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <RoutineForm
            key={routine.id}
            mode="edit"
            agents={agents}
            routine={routine}
            timeZone={detail.timeZone}
            schedulesEnabled={detail.schedulesEnabled}
            onSaved={saved}
          />
          {detail.webhookUrl && (
            <WebhookDetails
              routineId={routine.id}
              url={detail.webhookUrl}
              secret={secret}
              onNewSecret={setSecret}
            />
          )}
          {!detail.webhookUrl && secret && <SecretReveal secret={secret} />}
          <DeleteRoutine id={routine.id} name={routine.name} />
        </div>
        <RunHistory
          routineId={routine.id}
          runs={detail.runs}
          timeZone={detail.timeZone}
          onStarted={run =>
            setDetail(current => ({...current, runs: [run, ...current.runs]}))
          }
        />
      </div>
    </div>
  );
}
