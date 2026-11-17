import type {NextRequest} from 'next/server';
import {NextResponse} from 'next/server';

import {getSessionUser} from './lib/session';

/** Pages for people who are not signed in yet. */
const AUTH_PAGES = ['/sign-in', '/sign-up'];

/**
 * Runs before every page:
 * - signed out, any page except sign-in or sign-up goes to /sign-in;
 * - signed in, sign-in and sign-up go to the home page.
 */
export async function proxy(request: NextRequest) {
  const user = await getSessionUser(request.headers.get('cookie'));
  const isAuthPage = AUTH_PAGES.includes(request.nextUrl.pathname);

  if (!user && !isAuthPage) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }
  if (user && isAuthPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Skip API calls, Next.js internals and static files.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
