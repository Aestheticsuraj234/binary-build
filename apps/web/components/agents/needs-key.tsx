import Link from 'next/link';

import {CharacterFace} from '@/components/characters/character-face';
import {buttonVariants} from '@/components/ui/button';

/** Pebble asks for an API key, because agents need one to think. */
export function NeedsKey({message}: {message: string}) {
  return (
    <section className="flex flex-col items-start gap-5 rounded-lg border bg-card p-6 sm:flex-row sm:items-center">
      <CharacterFace character="pebble" mood="thinking" size={88} />
      <div className="flex-1">
        <h2 className="font-semibold">Add an API key first</h2>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      </div>
      <Link
        href="/keys"
        className={buttonVariants({size: 'lg', className: 'h-11 px-5'})}
      >
        Add an API key
      </Link>
    </section>
  );
}
