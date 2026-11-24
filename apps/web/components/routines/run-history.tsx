'use client';

import type {RoutineRun} from '@binary/shared';
import {RUN_SOURCE_LABELS, runDuration} from '@binary/shared';
import {MessageSquareIcon, PlayIcon} from 'lucide-react';
import Link from 'next/link';
import {useState} from 'react';

import {formatRunDate, RunStatusBadge} from '@/components/routines/run-status';
import {Alert} from '@/components/ui/alert';
import {Button} from '@/components/ui/button';
import {Spinner} from '@/components/ui/spinner';
import {ApiError, callApi} from '@/lib/client-api';

/** Runs, newest first, with Run now. Each finished run links to its transcript. */
export function RunHistory({
  routineId,
  runs,
  timeZone,
  onStarted,
}: {
  routineId: string;
  runs: RoutineRun[];
  timeZone: string | null;
  /** Called with the queued run, so the page can follow it. */
  onStarted: (run: RoutineRun) => void;
}) {
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string>();

  async function runNow() {
    setIsStarting(true);
    setError(undefined);
    try {
      const {run} = await callApi<{run: RoutineRun}>(
        `/api/routines/${routineId}/run`,
        {method: 'POST'},
      );
      onStarted(run);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught));
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <section aria-labelledby="runs-heading" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 id="runs-heading" className="text-2xl font-semibold">
          Runs
        </h2>
        <Button
          type="button"
          size="lg"
          onClick={() => void runNow()}
          disabled={isStarting}
          className="h-10 rounded-full px-4"
        >
          {isStarting ? <Spinner /> : <PlayIcon aria-hidden />}
          Run now
        </Button>
      </div>
      {error && (
        <Alert
          variant="destructive"
          className="border-destructive/40 bg-danger-surface"
        >
          {error}
        </Alert>
      )}
      {runs.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          No runs yet. Press Run now to try it.
        </p>
      ) : (
        <ul aria-live="polite" className="flex flex-col gap-2">
          {runs.map(run => {
            const duration = runDuration(run);
            return (
              <li
                key={run.id}
                className="flex flex-col gap-2 rounded-xl border bg-card px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <RunStatusBadge status={run.status} />
                  <span className="text-sm">
                    {formatRunDate(run.createdAt, timeZone)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {RUN_SOURCE_LABELS[run.source]}
                  </span>
                  {duration && (
                    <span className="font-mono text-xs text-muted-foreground">
                      {duration}
                    </span>
                  )}
                  {run.threadId && (
                    <Link
                      href={`/chats/${run.threadId}`}
                      className="ml-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                    >
                      <MessageSquareIcon aria-hidden className="size-4" />
                      Transcript
                    </Link>
                  )}
                </div>
                {run.error && (
                  <p className="text-sm text-destructive">{run.error}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
