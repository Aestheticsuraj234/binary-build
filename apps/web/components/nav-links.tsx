'use client';

import {cn} from 'cn';
import type {LucideIcon} from 'lucide-react';
import {
  BlocksIcon,
  CompassIcon,
  FlaskConicalIcon,
  KeyRoundIcon,
  PlugIcon,
} from 'lucide-react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** The app's main sections. Later chapters add theirs here. */
const NAV_ITEMS: NavItem[] = [
  {href: '/', label: 'Discover', icon: CompassIcon},
  {href: '/apps', label: 'Apps & tools', icon: PlugIcon},
  {href: '/integrations', label: 'Integrations', icon: BlocksIcon},
  {href: '/playground', label: 'Playground', icon: FlaskConicalIcon},
  {href: '/keys', label: 'API keys', icon: KeyRoundIcon},
];

/**
 * The main links. `activePath` highlights the current page; it is null in
 * the first, static render before the URL is known.
 */
export function NavLinkList({activePath}: {activePath: string | null}) {
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
          </Link>
        );
      })}
    </nav>
  );
}

/** The main links, with the current page highlighted. */
export function NavLinks() {
  return <NavLinkList activePath={usePathname()} />;
}
