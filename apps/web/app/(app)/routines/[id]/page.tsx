import {DEFAULT_APPROVAL_MODE} from '@binary/shared';
import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {Suspense} from 'react';

import {RoutineEditor} from '@/components/routines/routine-editor';
import {DetectTimeZone} from '@/components/routines/time-zone-note';
import {Skeleton} from '@/components/ui/skeleton';
import {fetchAgents, fetchRoutine} from '@/lib/api';

export const metadata: Metadata = {title: 'Routine · Binary'};

/** Loads the routine (404 if it isn't yours) and the crew to pick from. */
async function Routine({
  params,
}: {
  params: PageProps<'/routines/[id]'>['params'];
}) {
  const {id} = await params;
  const [detail, agents] = await Promise.all([fetchRoutine(id), fetchAgents()]);
  if (!detail) {
    notFound();
  }
  // The agent that runs it stays pickable, even if it was fired since.
  const choices = agents.some(agent => agent.id === detail.routine.agentId)
    ? agents
    : [
        {
          id: detail.routine.agentId,
          name: `${detail.routine.agentName} (fired)`,
          avatar: detail.routine.avatar,
          role: '',
          instructions: '',
          provider: null,
          model: null,
          templateId: null,
          approvalMode: DEFAULT_APPROVAL_MODE,
          computer: 'none' as const,
        },
        ...agents,
      ];
  return (
    <>
      <DetectTimeZone timeZone={detail.timeZone} />
      <RoutineEditor initial={detail} agents={choices} />
    </>
  );
}

export default function RoutinePage({params}: PageProps<'/routines/[id]'>) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-6xl px-4 py-16">
          <Skeleton className="h-[40rem] rounded-xl" />
        </div>
      }
    >
      <Routine params={params} />
    </Suspense>
  );
}
