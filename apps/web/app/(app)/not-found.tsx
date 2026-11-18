import Link from 'next/link';

import {CharacterFace} from '@/components/characters/character-face';
import {buttonVariants} from '@/components/ui/button';

/** Shown for a missing page, or someone else's agent or chat. */
export default function NotFound() {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 px-4 text-center">
      <CharacterFace character="pebble" mood="thinking" size={120} />
      <h1 className="text-2xl font-semibold">There&apos;s nobody here.</h1>
      <p className="max-w-sm text-muted-foreground">
        This agent or chat doesn&apos;t exist, or it isn&apos;t one of yours.
      </p>
      <Link
        href="/"
        className={buttonVariants({variant: 'secondary', size: 'lg'})}
      >
        Back to Discover
      </Link>
    </div>
  );
}
