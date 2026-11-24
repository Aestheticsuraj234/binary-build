import {characterOf, getProvider} from '@binary/shared';
import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {Suspense} from 'react';

import {AgentForm} from '@/components/agents/agent-form';
import {NeedsKey} from '@/components/agents/needs-key';
import {PageHeading} from '@/components/agents/page-heading';
import {Skeleton} from '@/components/ui/skeleton';
import {fetchAgent, fetchKeyStatuses, fetchSandboxes} from '@/lib/api';
import {connectedProviders} from '@/lib/providers';

export const metadata: Metadata = {title: 'Edit agent · Binary'};

async function EditAgent({
  params,
}: {
  params: PageProps<'/agents/[id]/edit'>['params'];
}) {
  const {id} = await params;
  const [agent, keys, sandboxes] = await Promise.all([
    fetchAgent(id),
    fetchKeyStatuses(),
    fetchSandboxes(),
  ]);
  if (!agent) {
    notFound();
  }
  const providers = connectedProviders(keys);
  const heading = {
    title: `Edit ${agent.name}`,
    description: 'Changes apply to the very next answer.',
    backHref: `/agents/${agent.id}`,
    backLabel: agent.name,
  };

  if (providers.length === 0) {
    return (
      <>
        <PageHeading {...heading} />
        <NeedsKey
          message={`${agent.name} needs a key to think with. Add one to keep working together.`}
        />
      </>
    );
  }

  // If the agent's provider lost its key, start on one that has a key.
  const provider =
    agent.provider && providers.includes(agent.provider)
      ? agent.provider
      : providers[0]!;
  const model =
    provider === agent.provider && agent.model
      ? agent.model
      : getProvider(provider).defaultModel;

  return (
    <>
      <PageHeading {...heading} />
      <AgentForm
        mode="edit"
        agentId={agent.id}
        connectedProviders={providers}
        sandboxesAvailable={sandboxes.available}
        initial={{
          name: agent.name,
          role: agent.role,
          instructions: agent.instructions,
          avatar: characterOf(agent.avatar).id,
          provider,
          model,
          approvalMode: agent.approvalMode,
          computer: agent.computer,
        }}
      />
    </>
  );
}

export default function EditAgentPage({
  params,
}: PageProps<'/agents/[id]/edit'>) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-8 sm:py-14">
      <Suspense fallback={<Skeleton className="h-[36rem] rounded-xl" />}>
        <EditAgent params={params} />
      </Suspense>
    </div>
  );
}
