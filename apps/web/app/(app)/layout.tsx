import {Suspense} from 'react';

import {MobileNav, MobileTopBar} from '@/components/shell/mobile-nav';
import {SidebarContent} from '@/components/shell/sidebar-content';

/**
 * The app shell: every signed-in page sits inside this layout. Wide screens
 * get a sidebar; phones get a top bar whose menu opens the same sidebar.
 */
export default function AppLayout({children}: LayoutProps<'/'>) {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh border-r md:block">
        <SidebarContent idPrefix="sidebar" />
      </aside>
      {/* The menu reads the URL, which is only known at request time. */}
      <Suspense fallback={<MobileTopBar />}>
        <MobileNav>
          <SidebarContent idPrefix="menu" />
        </MobileNav>
      </Suspense>
      <main className="min-w-0">{children}</main>
    </div>
  );
}
