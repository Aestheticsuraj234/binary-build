'use client';

import {cn} from 'cn';
import type {LucideIcon} from 'lucide-react';
import {
  BlocksIcon,
  BookOpenIcon,
  CompassIcon,
  FlaskConicalIcon,
  InboxIcon,
  KeyRoundIcon,
  LaptopIcon,
  PlugIcon,
  Repeat2Icon,
  UsersIcon,
} from 'lucide-react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useSyncExternalStore} from 'react';

import {getPendingCount, subscribeToPendingCount} from '@/lib/approval-events';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** The app's main sections. Later chapters add theirs here. */
const NAV_ITEMS: NavItem[] = [
  {href: '/today', label: 'Today', icon: InboxIcon},
  {href: '/', label: 'Discover', icon: CompassIcon},
  {href: '/rooms', label: 'Rooms', icon: UsersIcon},
  {href: '/routines', label: 'Routines', icon: Repeat2Icon},
  {href: '/knowledge', label: 'Knowledge', icon: BookOpenIcon},
  {href: '/apps', label: 'Apps & tools', icon: PlugIcon},
  {href: '/computers', label: 'Your computers', icon: LaptopIcon},
  {href: '/integrations', label: 'Integrations', icon: BlocksIcon},
  {href: '/playground', label: 'Playground', icon: FlaskConicalIcon},
  {href: '/keys', label: 'API keys', icon: KeyRoundIcon},
];

/**
 * The main links. `activePath` highlights the current page; it is null in
 * the first, static render before the URL is known.
 */
export function NavLinkList({
  activePath,
  pendingCount = 0,
}: {
  activePath: string | null;
  /** Requests waiting in Today, shown as a badge. */
  pendingCount?: number;
}) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV_ITEMS.map(({href, label, icon: Icon}) => {
        const isActive =
          activePath !== null &&
          (href === '/' ? activePath === '/' : activePath.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors',
              isActive
                ? 'bg-secondary font-medium text-foreground'
                : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
            )}
          >
            <Icon aria-hidden className="size-4" />
            {label}
            {href === '/today' && pendingCount > 0 && (
              <span
                aria-label={`${pendingCount} waiting`}
                className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-warning px-1.5 text-xs font-semibold text-background"
              >
                {pendingCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The main links, with the current page highlighted and Today's count.
 * The count starts from the server and follows changes made in this tab.
 */
export function NavLinks({initialPending = 0}: {initialPending?: number}) {
  const pending = useSyncExternalStore(
    subscribeToPendingCount,
    getPendingCount,
    () => undefined,
  );
  return (
    <NavLinkList
      activePath={usePathname()}
      pendingCount={pending ?? initialPending}
    />
  );
}
