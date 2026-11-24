import type {Metadata} from 'next';
import {Suspense} from 'react';

import {Page} from '@/components/page';
import {RunnersPanel} from '@/components/runners/runners-panel';
import {Skeleton} from '@/components/ui/skeleton';
import {fetchRunners} from '@/lib/api';

export const metadata: Metadata = {title: 'Your computers · Binary'};

async function Runners() {
  return <RunnersPanel initial={await fetchRunners()} />;
}

export default function ComputersPage() {
  return (
    <Page
      title="Your computers"
      description="The Runner is a small app that lets your characters work on your own computer: read and write files, run commands, or think with Claude Code and Codex. It only ever works inside the folders you share, and you can pause it at any time."
    >
      <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
        <Runners />
      </Suspense>
    </Page>
  );
}
