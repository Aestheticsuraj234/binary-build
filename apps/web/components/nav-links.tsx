'use client';

import {cn} from 'cn';
import type {LucideIcon} from 'lucide-react';
import {FlaskConicalIcon, HouseIcon, KeyRoundIcon} from 'lucide-react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** The app's main sections. Later chapters add theirs here. */
const NAV_ITEMS: NavItem[] = [
  {href: '/', label: 'Home', icon: HouseIcon},
  {href: '/playground', label: 'Playground', icon: FlaskConicalIcon},
  {href: '/keys', label: 'API keys', icon: KeyRoundIcon},
];

/** The links in the top bar, with the current page highlighted. */
export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex items-center gap-1">
      {NAV_ITEMS.map(({href, label, icon: Icon}) => {
        const isActive =
          href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex h-8 items-center gap-2 rounded-md px-3 text-sm transition-colors',
              isActive
                ? 'bg-secondary font-medium text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon aria-hidden className="size-4" />
            <span className="hidden sm:inline">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
