import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isValidSessionValue, SESSION_COOKIE } from '@/lib/session';
import { getSnapshot } from '@/lib/health/store';
import { ensureScheduler, runOnce } from '@/lib/health/scheduler';

export const runtime = 'nodejs';

/**
 * Health dashboard data.
 *   GET  → the latest aggregated snapshot (session-gated)
 *   POST → run a cycle on demand ("Run check now"), then return the snapshot
 *
 * The actual probing happens on the server every 5 min via the scheduler
 * (started in instrumentation.ts). Both handlers also call ensureScheduler() as
 * a belt-and-braces fallback in case the instrumentation hook didn't fire.
 */
export async function GET() {
  const session = cookies().get(SESSION_COOKIE)?.value;
  if (!(await isValidSessionValue(session))) {
    return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });
  }
  ensureScheduler();
  return NextResponse.json(getSnapshot(), { status: 200 });
}

export async function POST() {
  const session = cookies().get(SESSION_COOKIE)?.value;
  if (!(await isValidSessionValue(session))) {
    return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });
  }
  ensureScheduler();
  try {
    await runOnce();
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message ?? 'Health cycle failed.' },
      { status: 502 },
    );
  }
  return NextResponse.json(getSnapshot(), { status: 200 });
}
