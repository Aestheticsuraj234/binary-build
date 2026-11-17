import {ArrowLeftIcon} from 'lucide-react';
import Link from 'next/link';

/** A back link, a title and a line of description. */
export function PageHeading({
  title,
  description,
  backHref = '/',
  backLabel = 'Discover',
}: {
  title: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <header className="mb-8">
      <Link
        href={backHref}
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon aria-hidden className="size-4" />
        {backLabel}
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h1>
      {description && (
        <p className="mt-3 text-muted-foreground">{description}</p>
      )}
    </header>
  );
}
