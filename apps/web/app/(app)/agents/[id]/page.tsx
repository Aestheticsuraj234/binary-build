import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {Suspense} from 'react';

import {ChatView} from '@/components/chat/chat-view';
import {Skeleton} from '@/components/ui/skeleton';
import {fetchAgent, fetchKeyStatuses} from '@/lib/api';
import {connectedProviders} from '@/lib/providers';

export const metadata: Metadata = {title: 'New chat · Binary'};

/** Loads the agent (404 if it isn't yours), then opens a new chat. */
async function NewChat({
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
  // A fresh key on every visit, so "New chat" always starts over, even
  // when the address is the same.
  return (
    <ChatView
      key={crypto.randomUUID()}
      agent={agent}
      hasKey={hasKey}
      thread={null}
      initialMessages={[]}
      isFired={false}
    />
  );
}

export default function NewChatPage({params}: PageProps<'/agents/[id]'>) {
  return (
    <Suspense fallback={<Skeleton className="m-4 h-[80dvh] rounded-xl" />}>
      <NewChat params={params} />
    </Suspense>
  );
}
