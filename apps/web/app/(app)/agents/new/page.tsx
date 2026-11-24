import type {AgentTemplateSummary} from '@binary/shared';
import {characterOf, DEFAULT_APPROVAL_MODE, getProvider} from '@binary/shared';
import type {Metadata} from 'next';
import {Suspense} from 'react';

import {AgentForm} from '@/components/agents/agent-form';
import {NeedsKey} from '@/components/agents/needs-key';
import {PageHeading} from '@/components/agents/page-heading';
import {Skeleton} from '@/components/ui/skeleton';
import {fetchKeyStatuses, fetchComputers, fetchTemplates} from '@/lib/api';
import {connectedProviders} from '@/lib/providers';

export const metadata: Metadata = {title: 'Hire a character · Binary'};

function headingFor(template: AgentTemplateSummary | undefined) {
  if (!template) {
    return {
      title: 'Design your own',
      description: 'Pick a character, give it a name and a job.',
    };
  }
  const name = characterOf(template.character).name;
  return {
    title: `Hire ${name}`,
    description: `${name} comes ready as your ${template.name}. Change anything you like.`,
  };
}

/** Reads ?template=…, then fills the creator with that template. */
async function NewAgent({
  searchParams,
}: {
  searchParams: PageProps<'/agents/new'>['searchParams'];
}) {
  const {template: slug} = await searchParams;
  const [templates, keys, computers] = await Promise.all([
    fetchTemplates(),
    fetchKeyStatuses(),
    fetchComputers(),
  ]);
  const template = templates.find(t => t.slug === slug);
  const character = characterOf(template?.character ?? 'ember');
  const providers = connectedProviders(keys);
  const heading = headingFor(template);

  if (providers.length === 0) {
    return (
      <>
        <PageHeading {...heading} />
        <NeedsKey
          message={`Agents think with your own OpenAI, Anthropic or Google Gemini key. Add one, then come back to hire ${character.name}.`}
        />
      </>
    );
  }

  const provider = providers.includes('anthropic')
    ? 'anthropic'
    : providers[0]!;
  return (
    <>
      <PageHeading {...heading} />
      <AgentForm
        mode="hire"
        connectedProviders={providers}
        available={{
          cloud_sandbox: computers.sandbox.available,
          browser: computers.browser.available,
        }}
        templateId={template?.id ?? null}
        initial={{
          name: character.name,
          role: template?.role ?? '',
          instructions: template?.instructions ?? '',
          avatar: character.id,
          provider,
          model: getProvider(provider).defaultModel,
          approvalMode: DEFAULT_APPROVAL_MODE,
          // Templates come with computers (a sandbox for the Coding Agent,
          // a browser for the Research Assistant), when this Binary has them.
          computers: (template?.computers ?? []).filter(kind =>
            kind === 'cloud_sandbox'
              ? computers.sandbox.available
              : computers.browser.available,
          ),
        }}
      />
    </>
  );
}

export default function NewAgentPage({searchParams}: PageProps<'/agents/new'>) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-8 sm:py-14">
      <Suspense
        fallback={
          <div className="flex flex-col gap-6">
            <Skeleton className="h-24 w-full max-w-md" />
            <Skeleton className="h-[32rem] rounded-xl" />
          </div>
        }
      >
        <NewAgent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
