import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {Suspense} from 'react';

import {ChatView} from '@/components/chat/chat-view';
import {Skeleton} from '@/components/ui/skeleton';
import {fetchKeyStatuses, fetchThread} from '@/lib/api';
import {connectedProviders} from '@/lib/providers';

export const metadata: Metadata = {title: 'Chat · Binary'};

/** Loads a saved chat (404 if it isn't yours) and picks it up again. */
async function SavedChat({
  params,
}: {
  params: PageProps<'/chats/[id]'>['params'];
}) {
  const {id} = await params;
  const [detail, keys] = await Promise.all([
    fetchThread(id),
    fetchKeyStatuses(),
  ]);
  if (!detail) {
    notFound();
  }
  const {agent, thread, messages, isFired} = detail;
  const hasKey =
    agent.provider !== null &&
    connectedProviders(keys).includes(agent.provider);
  return (
    <ChatView
      key={thread.id}
      agent={agent}
      hasKey={hasKey}
      thread={thread}
      initialMessages={messages}
      isFired={isFired}
    />
  );
}

export default function ChatPage({params}: PageProps<'/chats/[id]'>) {
  return (
    <Suspense fallback={<Skeleton className="m-4 h-[80dvh] rounded-xl" />}>
      <SavedChat params={params} />
    </Suspense>
  );
}
