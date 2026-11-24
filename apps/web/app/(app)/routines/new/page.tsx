import type {Metadata} from 'next';
import Link from 'next/link';
import {Suspense} from 'react';

import {PageHeading} from '@/components/agents/page-heading';
import {RoutineCreator} from '@/components/routines/routine-creator';
import {DetectTimeZone} from '@/components/routines/time-zone-note';
import {Skeleton} from '@/components/ui/skeleton';
import {fetchAgents, fetchRoutines} from '@/lib/api';

export const metadata: Metadata = {title: 'New routine · Binary'};

async function NewRoutine() {
  const [agents, {schedulesEnabled, timeZone}] = await Promise.all([
    fetchAgents(),
    fetchRoutines(),
  ]);
  if (agents.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
        A routine needs someone to run it.{' '}
        <Link href="/" className="text-primary underline underline-offset-2">
          Hire a character
        </Link>{' '}
        first.
      </p>
    );
  }
  return (
    <>
      <DetectTimeZone timeZone={timeZone} />
      <RoutineCreator
        agents={agents}
        timeZone={timeZone}
        schedulesEnabled={schedulesEnabled}
      />
    </>
  );
}

export default function NewRoutinePage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:py-16">
      <PageHeading
        title="New routine"
        description="Something a character does again and again, without you watching."
        backHref="/routines"
        backLabel="Routines"
      />
      <Suspense fallback={<Skeleton className="h-[32rem] rounded-xl" />}>
        <NewRoutine />
      </Suspense>
    </div>
  );
}
