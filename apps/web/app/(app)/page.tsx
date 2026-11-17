import type {LucideIcon} from 'lucide-react';
import {ArrowRightIcon, FlaskConicalIcon, KeyRoundIcon} from 'lucide-react';
import {headers} from 'next/headers';
import Link from 'next/link';
import {redirect} from 'next/navigation';
import {Suspense} from 'react';

import {Page} from '@/components/page';
import {Skeleton} from '@/components/ui/skeleton';
import {getSessionUser} from '@/lib/session';

/** Greets the signed-in person. Reads the session, so it streams in. */
async function Greeting() {
  const user = await getSessionUser((await headers()).get('cookie'));
  if (!user) {
    // The proxy normally catches this first; this covers a session that
    // expired between the two checks.
    redirect('/sign-in');
  }
  return <>Hi, {user.name.split(' ')[0]}</>;
}

interface Shortcut {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

const SHORTCUTS: Shortcut[] = [
  {
    href: '/keys',
    title: 'Add your API keys',
    description:
      'Connect OpenAI, Anthropic or Google Gemini with your own key.',
    icon: KeyRoundIcon,
  },
  {
    href: '/playground',
    title: 'Try the Playground',
    description: 'Ask every connected model the same thing, side by side.',
    icon: FlaskConicalIcon,
  },
];

export default function HomePage() {
  return (
    <Page
      title="Home"
      description="Your AI coworkers will live here. For now, connect a model and try it out."
    >
      <h2 className="mb-6 text-xl font-semibold">
        <Suspense fallback={<Skeleton className="h-7 w-32" />}>
          <Greeting />
        </Suspense>
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {SHORTCUTS.map(({href, title, description, icon: Icon}) => (
          <Link
            key={href}
            href={href}
            className="group rounded-lg border bg-card p-5 transition-colors hover:border-input"
          >
            <Icon aria-hidden className="mb-4 size-5 text-primary" />
            <p className="flex items-center gap-2 font-medium">
              {title}
              <ArrowRightIcon
                aria-hidden
                className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              />
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </Link>
        ))}
      </div>
    </Page>
  );
}
