import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isValidSessionValue, SESSION_COOKIE } from '@/lib/session';
import { adminPassThrough, passThroughAllowed } from '@/lib/backend';
import { activeEnv } from '@/lib/env';
import { requireStepUp } from '@/lib/stepUp';

export const runtime = 'nodejs';

/**
 * Session-gated pass-through to the backend admin API for the analytics,
 * support, flags, policy and closures views:
 *   /api/admin/x/<path>  →  <backend>/api/v1/admin/<path>
 * Only the paths and methods allow-listed in lib/backend.ts get through.
 */
async function handle(req: Request, { params }: { params: { path: string[] } }) {
  const session = cookies().get(SESSION_COOKIE)?.value;
  if (!(await isValidSessionValue(session))) {
    return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });
  }
  const path = (params.path ?? []).map(encodeURIComponent).join('/');
  if (!passThroughAllowed(path, req.method)) {
    return NextResponse.json({ message: 'Not available from the console.' }, { status: 404 });
  }
  // Every write through here (flags, notification policy, push refresh,
  // activity import) needs the admin password again.
  if (req.method !== 'GET') {
    const denied = requireStepUp(req);
    if (denied) return denied;
  }
  const query = new URL(req.url).searchParams.toString();
  let body: unknown;
  if (req.method !== 'GET') {
    body = await req.json().catch(() => undefined);
    if (body === undefined) return NextResponse.json({ message: 'JSON body required.' }, { status: 400 });
  }
  try {
    const result = await adminPassThrough(activeEnv(), req.method, path, query, body);
    return NextResponse.json(result.data, { status: result.status });
  } catch (e: any) {
    return NextResponse.json({ message: e?.message ?? 'Proxy failed to reach backend.' }, { status: 502 });
  }
}

export const GET = handle;
export const PUT = handle;
export const POST = handle;
