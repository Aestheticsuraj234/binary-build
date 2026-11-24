'use client';

import type {AgentSummary, RoutineSaved} from '@binary/shared';
import {ArrowRightIcon} from 'lucide-react';
import {useRouter} from 'next/navigation';
import {useState} from 'react';

import {RoutineForm} from '@/components/routines/routine-form';
import {SecretReveal} from '@/components/routines/webhook-details';
import {Button} from '@/components/ui/button';

/**
 * Creates a routine. With a webhook, the new secret is shown here first
 * (it's never shown again), then the routine opens.
 */
export function RoutineCreator({
  agents,
  timeZone,
  schedulesEnabled,
}: {
  agents: AgentSummary[];
  timeZone: string | null;
  schedulesEnabled: boolean;
}) {
  const router = useRouter();
  const [created, setCreated] = useState<RoutineSaved | null>(null);

  function open(id: string) {
    router.push(`/routines/${id}`);
    router.refresh();
  }

  if (created?.webhookSecret) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-muted-foreground">
          <strong className="text-foreground">{created.routine.name}</strong> is
          ready. Its webhook needs this secret.
        </p>
        <SecretReveal secret={created.webhookSecret} />
        <Button
          type="button"
          size="lg"
          className="h-11 self-start px-5"
          onClick={() => open(created.routine.id)}
        >
          I&apos;ve saved it, open the routine
          <ArrowRightIcon aria-hidden />
        </Button>
      </div>
    );
  }

  return (
    <RoutineForm
      mode="create"
      agents={agents}
      timeZone={timeZone}
      schedulesEnabled={schedulesEnabled}
      onSaved={saved => {
        if (saved.webhookSecret) {
          setCreated(saved);
        } else {
          open(saved.routine.id);
        }
      }}
    />
  );
}
