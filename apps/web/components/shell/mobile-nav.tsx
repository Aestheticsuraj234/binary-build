'use client';

import {MenuIcon, XIcon} from 'lucide-react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import type {ReactNode} from 'react';
import {useEffect, useState} from 'react';

import {Logo} from '@/components/logo';
import {Button} from '@/components/ui/button';

/** The phone top bar. `onOpenMenu` is missing in the first, static render. */
export function MobileTopBar({
  isOpen = false,
  onOpenMenu,
}: {
  isOpen?: boolean;
  onOpenMenu?: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur md:hidden">
      <Link href="/" aria-label="Binary home">
        <Logo />
      </Link>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Open menu"
        aria-expanded={isOpen}
        aria-controls="mobile-menu"
        disabled={!onOpenMenu}
        onClick={onOpenMenu}
      >
        <MenuIcon aria-hidden />
      </Button>
    </header>
  );
}

/**
 * The phone version of the sidebar: a top bar with a menu button that slides
 * the same sidebar content in from the left.
 */
export function MobileNav({children}: {children: ReactNode}) {
  const pathname = usePathname();
  // The page the menu was opened on. Following a link changes the page, so
  // the menu closes by itself without any extra code.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const isOpen = openedOn === pathname;
  const close = () => setOpenedOn(null);

  // Escape closes it too, and the page behind can't scroll while it's open.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenedOn(null);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <>
      <MobileTopBar isOpen={isOpen} onOpenMenu={() => setOpenedOn(pathname)} />

      {isOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/60"
            onClick={() => close()}
          />
          <div
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col border-r bg-background"
          >
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close menu"
              className="absolute top-3 right-3 z-10"
              autoFocus
              onClick={() => close()}
            >
              <XIcon aria-hidden />
            </Button>
            {children}
          </div>
        </div>
      )}
    </>
  );
}
