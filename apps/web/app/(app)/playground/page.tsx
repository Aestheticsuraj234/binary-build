import {PROVIDERS} from '@binary/shared';
import type {Metadata} from 'next';
import {Suspense} from 'react';

import {Page} from '@/components/page';
import {Playground} from '@/components/playground/playground';
import {Skeleton} from '@/components/ui/skeleton';
import {fetchKeyStatuses} from '@/lib/api';

export const metadata: Metadata = {title: 'Playground · Binary'};

/** Loads which providers are connected, then shows the Playground. */
async function PlaygroundLoader() {
  return <Playground keys={await fetchKeyStatuses()} />;
}

function PlaygroundSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-36" />
      <div className="grid gap-4 md:grid-cols-3">
        {PROVIDERS.map(provider => (
          <Skeleton key={provider.id} className="h-64 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export default function PlaygroundPage() {
  return (
    <Page
      width="wide"
      title="Playground"
      description="Send one prompt to every provider you've connected and compare the answers side by side."
    >
      <Suspense fallback={<PlaygroundSkeleton />}>
        <PlaygroundLoader />
      </Suspense>
    </Page>
  );
}
