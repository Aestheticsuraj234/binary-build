import type {Metadata} from 'next';
import {headers} from 'next/headers';
import {Suspense} from 'react';

import {
  AgentCard,
  DesignYourOwnCard,
  TemplateCard,
} from '@/components/agents/cards';
import {NeedsKey} from '@/components/agents/needs-key';
import {CharacterFace} from '@/components/characters/character-face';
import {Skeleton} from '@/components/ui/skeleton';
import {fetchAgents, fetchKeyStatuses, fetchTemplates} from '@/lib/api';
import {getSessionUser} from '@/lib/session';

export const metadata: Metadata = {title: 'Discover · Binary'};

const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3';

/** "Hi Grace", once the session is read. */
async function Greeting() {
  const user = await getSessionUser((await headers()).get('cookie'));
  return <>Hi {user?.name.split(' ')[0] ?? 'there'}</>;
}

/** Pebble's request for a key, shown only when no key is saved. */
async function KeyPrompt() {
  const keys = await fetchKeyStatuses();
  if (keys.some(key => key.connected)) {
    return null;
  }
  return (
    <div className="mb-12">
      <NeedsKey message="Your agents think with your own OpenAI, Anthropic or Google Gemini key. Add one to start hiring." />
    </div>
  );
}

/** Your hired agents. Hidden until you hire someone. */
async function Crew() {
  const agents = await fetchAgents();
  if (agents.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="crew-title" className="mb-14">
      <h2 id="crew-title" className="text-2xl font-semibold tracking-tight">
        Your crew
      </h2>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Pick someone to talk to.
      </p>
      <div className={GRID}>
        {agents.map(agent => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
    </section>
  );
}

/** The templates, each played by a character, plus "Design your own". */
async function Cast() {
  const templates = await fetchTemplates();
  return (
    <div className={GRID}>
      {templates.map(template => (
        <TemplateCard key={template.id} template={template} />
      ))}
      <DesignYourOwnCard />
    </div>
  );
}

function CardsSkeleton() {
  return (
    <div className={GRID}>
      {[0, 1, 2].map(index => (
        <Skeleton key={index} className="h-72 rounded-lg" />
      ))}
    </div>
  );
}

export default function DiscoverPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-8 sm:py-14">
      <header className="mb-12 flex items-center justify-between gap-6">
        <div className="max-w-xl">
          <p className="text-sm text-muted-foreground">
            <Suspense fallback="Hi">
              <Greeting />
            </Suspense>
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Who are we working with today?
          </h1>
          <p className="mt-4 text-muted-foreground">
            Every character has a job, a personality and a model to think with.
            Hire one and give it something to do.
          </p>
        </div>
        <div aria-hidden className="hidden shrink-0 items-end lg:flex">
          <CharacterFace character="sunny" size={104} />
          <CharacterFace character="nova" size={124} className="-ml-2" />
          <CharacterFace character="bolt" size={104} className="-ml-2" />
        </div>
      </header>

      <Suspense fallback={null}>
        <KeyPrompt />
      </Suspense>

      <Suspense fallback={<CardsSkeleton />}>
        <Crew />
      </Suspense>

      <section aria-labelledby="cast-title">
        <h2 id="cast-title" className="text-2xl font-semibold tracking-tight">
          Meet the cast
        </h2>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">
          Ready-made roles. Change anything before you hire them.
        </p>
        <Suspense fallback={<CardsSkeleton />}>
          <Cast />
        </Suspense>
      </section>
    </div>
  );
}
