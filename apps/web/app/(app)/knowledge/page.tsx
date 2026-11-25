import type {Metadata} from 'next';
import {Suspense} from 'react';

import {NeedsKey} from '@/components/agents/needs-key';
import {KnowledgePanel} from '@/components/knowledge/knowledge-panel';
import {Page} from '@/components/page';
import {Skeleton} from '@/components/ui/skeleton';
import {fetchKnowledge} from '@/lib/api';

export const metadata: Metadata = {title: 'Knowledge · Binary'};

async function Library() {
  const {status, documents} = await fetchKnowledge();
  if (!status.available) {
    return <NeedsKey title="Knowledge is off" message={status.message} />;
  }
  return <KnowledgePanel initialDocuments={documents} />;
}

export default function KnowledgePage() {
  return (
    <Page
      title="Knowledge"
      description="Your own documents, for every character to search by meaning and cite. What they say is treated as information, never as instructions."
    >
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <Library />
      </Suspense>
    </Page>
  );
}
