import {runDuration} from '@binary/shared';
import type {Metadata} from 'next';
import Link from 'next/link';
import {Suspense} from 'react';

import {WaitingList} from '@/components/approvals/waiting-list';
import {CharacterFace} from '@/components/characters/character-face';
import {Page} from '@/components/page';
import {formatRunDate, RunStatusBadge} from '@/components/routines/run-status';
import {Skeleton} from '@/components/ui/skeleton';
import {fetchRoutines, fetchToday} from '@/lib/api';

export const metadata: Metadata = {title: 'Today · Binary'};

async function Inbox() {
  const [{waiting, recentRuns}, {timeZone}] = await Promise.all([
    fetchToday(),
    fetchRoutines(),
  ]);
  return (
    <>
      <section aria-labelledby="waiting-heading">
        <h2 id="waiting-heading" className="mb-4 text-2xl font-semibold">
          Waiting for you
        </h2>
        <WaitingList initial={waiting} timeZone={timeZone} />
      </section>

      <section aria-labelledby="runs-heading" className="mt-12">
        <h2 id="runs-heading" className="mb-4 text-2xl font-semibold">
          Routine runs
        </h2>
        {recentRuns.length === 0 ? (
          <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
            No routine ran in the last 24 hours.{' '}
            <Link href="/routines" className="text-foreground underline">
              See your routines
            </Link>
            .
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recentRuns.map(run => {
              const duration = runDuration(run);
              return (
                <li
                  key={run.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3"
                >
                  <CharacterFace
                    character={run.avatar}
                    size={32}
                    animated={false}
                  />
                  <Link
                    href={`/routines/${run.routineId}`}
                    className="font-medium hover:underline"
                  >
                    {run.routineName}
                  </Link>
                  <RunStatusBadge status={run.status} />
                  <span className="text-sm text-muted-foreground">
                    {formatRunDate(run.createdAt, timeZone)}
                  </span>
                  {duration && (
                    <span className="font-mono text-xs text-muted-foreground">
                      {duration}
                    </span>
                  )}
                  {run.threadId && (
                    <Link
                      href={`/chats/${run.threadId}`}
                      className="ml-auto text-sm text-muted-foreground hover:text-foreground"
                    >
                      Transcript
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

export default function TodayPage() {
  return (
    <Page
      title="Today"
      description="What your characters need from you, and what they did on their own."
    >
      <Suspense
        fallback={
          <div className="flex flex-col gap-3">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        }
      >
        <Inbox />
      </Suspense>
    </Page>
  );
}
