import {RISK_INFO, TOOL_RISKS} from '@binary/shared';
import {ArrowRightIcon} from 'lucide-react';
import type {Metadata} from 'next';
import Link from 'next/link';
import {Suspense} from 'react';

import {Page} from '@/components/page';
import {AppsPanel} from '@/components/tools/apps-panel';
import {RiskBadge, ToolList} from '@/components/tools/risk-badge';
import {Skeleton} from '@/components/ui/skeleton';
import {fetchToolsOverview} from '@/lib/api';

export const metadata: Metadata = {title: 'Apps & tools · Binary'};

/** Built-in tools and connected apps. Apps are asked for their tools, so this streams in. */
async function Tools() {
  const {builtIn, apps} = await fetchToolsOverview();
  return (
    <>
      <section aria-labelledby="built-in-heading" className="mt-12">
        <h2 id="built-in-heading" className="text-2xl font-semibold">
          Built into Binary
        </h2>
        <div className="mt-4 rounded-lg border bg-card p-5">
          <ToolList tools={builtIn} />
        </div>
      </section>
      <section aria-labelledby="apps-heading" className="mt-12">
        <h2 id="apps-heading" className="text-2xl font-semibold">
          Connected apps
        </h2>
        <div className="mt-4">
          <AppsPanel initialApps={apps} />
        </div>
      </section>
    </>
  );
}

export default function AppsPage() {
  return (
    <Page
      title="Apps & tools"
      description="Tools let your characters look things up and act for you. Every character can use every tool below; connect apps to add more."
      width="wide"
    >
      <ul className="grid gap-4 sm:grid-cols-3">
        {TOOL_RISKS.map(risk => (
          <li key={risk} className="rounded-lg border bg-card p-4">
            <RiskBadge risk={risk} />
            <p className="mt-3 text-sm text-muted-foreground">
              {RISK_INFO[risk].description}
            </p>
          </li>
        ))}
      </ul>
      <Suspense
        fallback={
          <div className="mt-12 flex flex-col gap-4">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-32 rounded-lg" />
            <Skeleton className="h-64 rounded-lg" />
          </div>
        }
      >
        <Tools />
      </Suspense>
      <section aria-labelledby="composio-heading" className="mt-12">
        <h2 id="composio-heading" className="text-2xl font-semibold">
          Gmail, GitHub, Slack and many more
        </h2>
        <Link
          href="/integrations"
          className="group mt-4 flex items-center justify-between gap-4 rounded-lg border bg-card p-5 transition-colors hover:border-input focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span>
            <span className="font-medium">Browse integrations</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              Search every app Composio connects, sign in, and manage what your
              agents can reach.
            </span>
          </span>
          <ArrowRightIcon
            aria-hidden
            className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
          />
        </Link>
      </section>
    </Page>
  );
}
