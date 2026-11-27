/**
 * Step-up check: the admin password, asked again for every action that
 * changes something (sending a push or an email, flipping a flag, editing the
 * notification policy, importing activity, deleting an email draft).
 *
 * The browser sends the password in the `X-Admin-Confirm` header of THAT one
 * request (over HTTPS, to this app only). It is checked here and never
 * forwarded to the backend or stored. A signed-in session alone is not enough
 * to change anything, so a forgotten open tab or a stolen session cookie can
 * only read.
 *
 * Wrong passwords are counted per client IP: 5 in 10 minutes locks step-up
 * for 10 minutes (the session stays signed in and can still read).
 */
import 'server-only';
import { NextResponse } from 'next/server';
import { timingSafeEqual, createHash } from 'crypto';

export const STEP_UP_HEADER = 'x-admin-confirm';

const WINDOW_MS = 10 * 60_000;
const MAX_FAILS = 5;
const fails = new Map<string, { n: number; first: number; lockedUntil: number }>();

function clientKey(req: Request): string {
  const h = req.headers;
  return (h.get('cf-connecting-ip') || h.get('x-forwarded-for')?.split(',')[0] || h.get('x-real-ip') || 'local').trim();
}

/** Constant-time compare of two strings (hashing first equalises lengths). */
export function samePassword(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

/**
 * null = confirmed, go ahead. Otherwise the response to return as-is.
 * `stepUp: true` in the body tells the client to ask for the password.
 */
export function requireStepUp(req: Request): NextResponse | null {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return NextResponse.json({ message: 'ADMIN_PASSWORD not configured on the server.' }, { status: 503 });
  }
  const key = clientKey(req);
  const now = Date.now();
  const rec = fails.get(key);
  if (rec && rec.lockedUntil > now) {
    const mins = Math.ceil((rec.lockedUntil - now) / 60_000);
    return NextResponse.json({ message: `Too many wrong passwords. Try again in ${mins} min.`, stepUp: true, locked: true }, { status: 429 });
  }
  const given = req.headers.get(STEP_UP_HEADER) || '';
  if (!given) {
    return NextResponse.json({ message: 'Confirm with the admin password.', stepUp: true }, { status: 401 });
  }
  if (!samePassword(given, expected)) {
    const r = rec && now - rec.first < WINDOW_MS ? rec : { n: 0, first: now, lockedUntil: 0 };
    r.n += 1;
    if (r.n >= MAX_FAILS) { r.lockedUntil = now + WINDOW_MS; r.n = 0; r.first = now; }
    fails.set(key, r);
    console.warn(`[step-up] wrong password from ${key} (${r.lockedUntil > now ? 'locked' : `${r.n}/${MAX_FAILS}`})`);
    return NextResponse.json({ message: 'Incorrect password.', stepUp: true }, { status: 401 });
  }
  fails.delete(key);
  return null;
}
