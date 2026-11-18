import type {Metadata} from 'next';
import {Suspense} from 'react';

import {IntegrationsBrowser} from '@/components/integrations/integrations-browser';
import {Page} from '@/components/page';
import {Skeleton} from '@/components/ui/skeleton';
import {fetchIntegrations} from '@/lib/api';

export const metadata: Metadata = {title: 'Integrations · Binary'};

/** The catalog comes from Composio, so it streams in. */
async function Catalog() {
  return <IntegrationsBrowser initial={await fetchIntegrations()} />;
}

/** Rows shaped like the real table while the catalog loads. */
function CatalogSkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-5">
      <span className="sr-only">Loading integrations…</span>
      <div className="flex flex-col gap-3 lg:flex-row">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 lg:w-56" />
        <Skeleton className="h-10 lg:w-80" />
      </div>
      <div className="overflow-hidden rounded-lg border">
        <Skeleton className="h-11 rounded-none" />
        {Array.from({length: 8}, (_, index) => (
          <div
            key={index}
            className="flex items-center gap-3 border-t px-4 py-3"
          >
            <Skeleton className="size-9 rounded-md" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="hidden h-5 w-24 md:block" />
            <Skeleton className="h-8 w-36" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <Page
      title="Integrations"
      description="Every app Composio can connect. Sign in once and every character can use its tools; anything that changes things stays blocked until approvals arrive."
      width="wide"
    >
      <Suspense fallback={<CatalogSkeleton />}>
        <Catalog />
      </Suspense>
    </Page>
  );
}
