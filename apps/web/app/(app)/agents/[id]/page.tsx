import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {Suspense} from 'react';

import {AgentChat} from '@/components/agents/agent-chat';
import {Skeleton} from '@/components/ui/skeleton';
import {fetchAgent, fetchKeyStatuses} from '@/lib/api';
import {connectedProviders} from '@/lib/providers';

export const metadata: Metadata = {title: 'Conversation · Binary'};

/** Loads the agent (404 if it isn't yours), then shows the conversation. */
async function Conversation({
  params,
}: {
  params: PageProps<'/agents/[id]'>['params'];
}) {
  const {id} = await params;
  const [agent, keys] = await Promise.all([fetchAgent(id), fetchKeyStatuses()]);
  if (!agent) {
    notFound();
  }
  const hasKey =
    agent.provider !== null &&
    connectedProviders(keys).includes(agent.provider);
  // `key` resets the chat when moving between agents.
  return <AgentChat key={agent.id} agent={agent} hasKey={hasKey} />;
}

export default function AgentPage({params}: PageProps<'/agents/[id]'>) {
  return (
    <Suspense fallback={<Skeleton className="m-4 h-[80dvh] rounded-xl" />}>
      <Conversation params={params} />
    </Suspense>
  );
}
