import {AppHeader} from '@/components/app-header';

/**
 * The app shell: every signed-in page sits inside this layout, under the
 * shared top bar. Later chapters add their pages to this folder.
 */
export default function AppLayout({children}: LayoutProps<'/'>) {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="flex-1">{children}</main>
    </div>
  );
}
