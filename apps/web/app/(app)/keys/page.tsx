import {PROVIDERS} from '@binary/shared';
import {LockIcon} from 'lucide-react';
import type {Metadata} from 'next';
import {Suspense} from 'react';

import {KeyCard} from '@/components/keys/key-card';
import {Page} from '@/components/page';
import {Skeleton} from '@/components/ui/skeleton';
import {fetchKeyStatuses} from '@/lib/api';

export const metadata: Metadata = {title: 'API keys · Binary'};

/** One card per provider. Loads the saved keys, so it streams in. */
async function KeyList() {
  const statuses = await fetchKeyStatuses();
  return (
    <div className="flex flex-col gap-4">
      {statuses.map(status => (
        <KeyCard key={status.provider} initialStatus={status} />
      ))}
    </div>
  );
}

function KeyListSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {PROVIDERS.map(provider => (
        <Skeleton key={provider.id} className="h-40 rounded-lg" />
      ))}
    </div>
  );
}

export default function KeysPage() {
  return (
    <Page
      title="API keys"
      description="Binary calls AI models with your own keys, so you only pay your provider for what you use."
    >
      <p className="-mt-4 mb-10 flex items-center gap-2 text-sm text-muted-foreground">
        <LockIcon aria-hidden className="size-4 shrink-0 text-primary" />
        Keys are encrypted with AES-256-GCM. Only the last 4 characters are ever
        shown.
      </p>
      <Suspense fallback={<KeyListSkeleton />}>
        <KeyList />
      </Suspense>
    </Page>
  );
}
