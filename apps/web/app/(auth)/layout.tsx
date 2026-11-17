import {Logo} from '@/components/logo';

/** Shared frame for the sign-in and sign-up pages. */
export default function AuthLayout({children}: LayoutProps<'/'>) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex justify-center">
          <Logo />
        </div>
        {children}
      </div>
    </main>
  );
}
