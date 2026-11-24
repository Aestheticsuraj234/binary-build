import type {AgentSummary, AgentTemplateSummary} from '@binary/shared';
import {characterOf, ENGINE_INFO, getProvider} from '@binary/shared';
import {cn} from 'cn';
import {ArrowRightIcon, PlusIcon} from 'lucide-react';
import Link from 'next/link';
import type {ReactNode} from 'react';

import {CharacterFace} from '@/components/characters/character-face';
import {Badge} from '@/components/ui/badge';

/** "Anthropic · claude-sonnet-5-5", or nothing when no model is set. */
export function ModelBadge({
  provider,
  model,
  engine = 'api',
  className,
}: {
  provider: AgentSummary['provider'];
  model: string | null;
  /** Claude Code or Codex show as themselves, not the API model. */
  engine?: AgentSummary['engine'];
  className?: string;
}) {
  if (engine !== 'api') {
    return (
      <Badge className={cn('max-w-full font-mono text-[11px]', className)}>
        <span className="truncate">
          {ENGINE_INFO[engine].label} · on your computer
        </span>
      </Badge>
    );
  }
  if (!provider || !model) {
    return null;
  }
  return (
    <Badge className={cn('max-w-full font-mono text-[11px]', className)}>
      <span className="truncate">
        {getProvider(provider).name} · {model}
      </span>
    </Badge>
  );
}

/** A card with the character drawn on a tinted panel at the top. */
function CharacterCard({
  href,
  character,
  children,
}: {
  href: string;
  character: string;
  children: ReactNode;
}) {
  const info = characterOf(character);
  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-lg border bg-card transition-colors hover:border-input focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div
        className="flex h-40 items-center justify-center"
        style={{backgroundColor: info.tint}}
      >
        <CharacterFace
          character={info.id}
          size={112}
          className="transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none"
        />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">{children}</div>
    </Link>
  );
}

/** One of your hired agents. */
export function AgentCard({agent}: {agent: AgentSummary}) {
  return (
    <CharacterCard href={`/agents/${agent.id}`} character={agent.avatar}>
      <h3 className="text-lg font-semibold">{agent.name}</h3>
      <p className="line-clamp-2 flex-1 text-sm text-muted-foreground">
        {agent.role}
      </p>
      <div>
        <ModelBadge
          provider={agent.provider}
          model={agent.model}
          engine={agent.engine}
        />
      </div>
    </CharacterCard>
  );
}

/** A template, played by its character, ready to hire. */
export function TemplateCard({template}: {template: AgentTemplateSummary}) {
  const info = characterOf(template.character);
  return (
    <CharacterCard
      href={`/agents/new?template=${template.slug}`}
      character={info.id}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-lg font-semibold">{info.name}</h3>
        <span className="truncate text-xs text-muted-foreground">
          {template.name}
        </span>
      </div>
      <p className="flex-1 text-sm text-muted-foreground">{info.personality}</p>
      <span className="flex items-center gap-1.5 text-sm font-medium">
        Hire {info.name}
        <ArrowRightIcon
          aria-hidden
          className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
        />
      </span>
    </CharacterCard>
  );
}

/** The "start from scratch" card, with the characters no template uses. */
export function DesignYourOwnCard() {
  return (
    <Link
      href="/agents/new"
      className="group flex flex-col overflow-hidden rounded-lg border border-dashed border-input transition-colors hover:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div aria-hidden className="flex h-40 items-center justify-center">
        {['ember', 'moss', 'pebble', 'juno'].map((id, index) => (
          <span
            key={id}
            className="-ml-3 flex size-16 items-center justify-center rounded-full border-2 border-background first:ml-0"
            style={{backgroundColor: characterOf(id).tint, zIndex: 4 - index}}
          >
            <CharacterFace character={id} size={54} animated={false} />
          </span>
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <h3 className="text-lg font-semibold">Design your own</h3>
        <p className="flex-1 text-sm text-muted-foreground">
          Pick any character, give it a name and a job.
        </p>
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <PlusIcon aria-hidden className="size-4" />
          Start from scratch
        </span>
      </div>
    </Link>
  );
}
