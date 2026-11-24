import type {RoutineSummary} from '@binary/shared';
import {describeSchedule} from '@binary/shared';
import {cn} from 'cn';
import {ClockIcon, PlusIcon, WebhookIcon} from 'lucide-react';
import type {Metadata} from 'next';
import Link from 'next/link';
import {Suspense} from 'react';

import {CharacterFace} from '@/components/characters/character-face';
import {formatRunDate, RunStatusBadge} from '@/components/routines/run-status';
import {DetectTimeZone} from '@/components/routines/time-zone-note';
import {buttonVariants} from '@/components/ui/button';
import {Skeleton} from '@/components/ui/skeleton';
import {fetchRoutines} from '@/lib/api';

export const metadata: Metadata = {title: 'Routines · Binary'};

/** A small outlined chip, like "Weekdays at 9:00" or "Webhook". */
function Chip({children}: {children: React.ReactNode}) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-secondary px-2 text-xs text-foreground">
      {children}
    </span>
  );
}

function RoutineCard({
  routine,
  timeZone,
}: {
  routine: RoutineSummary;
  timeZone: string | null;
}) {
  return (
    <li>
      <Link
        href={`/routines/${routine.id}`}
        className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4 transition-colors hover:border-input focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <CharacterFace character={routine.avatar} size={48} animated={false} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="flex items-center gap-2">
            <span className="truncate font-semibold">{routine.name}</span>
            <span
              className={cn(
                'rounded-md border px-1.5 text-xs',
                routine.enabled
                  ? 'border-input text-muted-foreground'
                  : 'border-input text-foreground',
              )}
            >
              {routine.enabled ? 'On' : 'Off'}
            </span>
          </p>
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{routine.agentName}</span>
            {routine.cron && (
              <Chip>
                <ClockIcon aria-hidden className="size-3" />
                {describeSchedule(routine.cron)}
              </Chip>
            )}
            {routine.webhook && (
              <Chip>
                <WebhookIcon aria-hidden className="size-3" />
                Webhook
              </Chip>
            )}
          </p>
        </div>
        {routine.lastRun && (
          <div className="flex items-center gap-3">
            <RunStatusBadge status={routine.lastRun.status} />
            <span className="text-xs text-muted-foreground">
              {formatRunDate(routine.lastRun.createdAt, timeZone)}
            </span>
          </div>
        )}
      </Link>
    </li>
  );
}

async function RoutineList() {
  const {routines, schedulesEnabled, timeZone} = await fetchRoutines();
  return (
    <>
      <DetectTimeZone timeZone={timeZone} />
      {!schedulesEnabled && (
        <p className="mb-6 rounded-xl border border-warning/40 bg-warning-surface px-4 py-3 text-sm text-warning">
          Trigger.dev is not connected, so schedules are saved but won&apos;t
          fire, and runs happen inside the API. Run now and webhooks work. Add{' '}
          <code className="font-mono">TRIGGER_SECRET_KEY</code> and run{' '}
          <code className="font-mono">pnpm trigger:dev</code> to make them
          durable.
        </p>
      )}
      {routines.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
          <p className="font-medium">No routines yet</p>
          <p className="text-sm text-muted-foreground">
            Try &ldquo;every weekday at 9:00, plan my day&rdquo;.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {routines.map(routine => (
            <RoutineCard
              key={routine.id}
              routine={routine}
              timeZone={timeZone}
            />
          ))}
        </ul>
      )}
    </>
  );
}

export default function RoutinesPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:py-16">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xl">
          <h1 className="text-4xl font-semibold tracking-tight">Routines</h1>
          <p className="mt-3 text-muted-foreground">
            Jobs your characters do again and again: on a schedule, when a
            webhook calls, or when you press Run now.
          </p>
        </div>
        <Link
          href="/routines/new"
          className={cn(buttonVariants({size: 'lg'}), 'h-10 rounded-full px-4')}
        >
          <PlusIcon aria-hidden />
          New routine
        </Link>
      </header>
      <Suspense
        fallback={
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
        }
      >
        <RoutineList />
      </Suspense>
    </div>
  );
}
