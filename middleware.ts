import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isValidSessionValue, SESSION_COOKIE } from '@/lib/session';

/**
 * Redirects unauthenticated visitors to /login. Runs on every page request
 * except the login page, the auth/proxy API routes (which check the session
 * themselves), and static assets.
 */
export async function middleware(req: NextRequest) {
  const session = req.cookies.get(SESSION_COOKIE)?.value;
  const authed = await isValidSessionValue(session);

  if (!authed) {
    // Build the redirect from the PROXIED host/proto, not req.nextUrl —
    // behind nginx, Next's standalone server reports its own origin
    // (localhost:4000), which would send users to an unreachable URL.
    const host =
      req.headers.get('x-forwarded-host') ??
      req.headers.get('host') ??
      req.nextUrl.host;
    const proto =
      req.headers.get('x-forwarded-proto') ??
      req.nextUrl.protocol.replace(':', '');
    const url = new URL(`${proto}://${host}/login`);
    url.searchParams.set('from', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Protect everything except: login page, all API routes, Next internals.
  matcher: ['/((?!login|api|_next/static|_next/image|favicon.ico).*)'],
};
