import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {Suspense} from 'react';

import {NeedsKey} from '@/components/agents/needs-key';
import {PageHeading} from '@/components/agents/page-heading';
import {MemoryPanel} from '@/components/memory/memory-panel';
import {Skeleton} from '@/components/ui/skeleton';
import {fetchAgent, fetchMemories} from '@/lib/api';

export const metadata: Metadata = {title: 'Memory · Binary'};

async function Memory({
  params,
}: {
  params: PageProps<'/agents/[id]/memory'>['params'];
}) {
  const {id} = await params;
  const [agent, overview] = await Promise.all([
    fetchAgent(id),
    fetchMemories(id),
  ]);
  if (!agent || !overview) {
    notFound();
  }
  const {status} = overview;
  return (
    <>
      <PageHeading
        title={`What ${agent.name} remembers`}
        description={`Lasting facts about you that ${agent.name} reads before every answer, in every chat. Only ${agent.name} sees these.`}
        backHref={`/agents/${agent.id}`}
        backLabel={agent.name}
      />
      {!status.available && (
        <div className="mb-8">
          <NeedsKey title="Memory is off" message={status.message} />
        </div>
      )}
      {(status.available || overview.memories.length > 0) && (
        <MemoryPanel
          agentId={agent.id}
          agentName={agent.name}
          initialMemories={overview.memories}
          initialOtherModelCount={overview.otherModelCount}
          enabled={status.available}
        />
      )}
    </>
  );
}

export default function MemoryPage({params}: PageProps<'/agents/[id]/memory'>) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-8 sm:py-14">
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <Memory params={params} />
      </Suspense>
    </div>
  );
}
