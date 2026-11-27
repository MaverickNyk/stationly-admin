import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isValidSessionValue, SESSION_COOKIE } from '@/lib/session';
import { adminEmailProxy, emailPathAllowed } from '@/lib/backend';
import { activeEnv } from '@/lib/env';
import { requireStepUp } from '@/lib/stepUp';

/** Email actions that send or destroy something. Draft edits and uploads don't ask. */
const NEEDS_STEP_UP: Array<{ re: RegExp; method: string }> = [
  { re: /^campaigns\/[A-Za-z0-9]{1,40}\/send$/, method: 'POST' },
  { re: /^test$/, method: 'POST' },
  { re: /^campaigns\/[A-Za-z0-9]{1,40}$/, method: 'DELETE' },
];

export const runtime = 'nodejs';

/**
 * Session-gated proxy for the email studio:
 *   /api/admin/email/<path>  →  <backend>/api/v1/admin/email/<path>
 * Only the allow-listed paths and methods in lib/backend.ts get through.
 * Image uploads are base64 JSON (up to ~14 MB); the route reads the body
 * itself, so no Next body limit applies.
 */
async function handle(req: Request, { params }: { params: { path: string[] } }) {
  const session = cookies().get(SESSION_COOKIE)?.value;
  if (!(await isValidSessionValue(session))) {
    return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });
  }
  const path = (params.path ?? []).map(encodeURIComponent).join('/');
  if (!emailPathAllowed(path, req.method)) {
    return NextResponse.json({ message: 'Not available from the console.' }, { status: 404 });
  }
  if (NEEDS_STEP_UP.some((r) => r.method === req.method && r.re.test(path))) {
    const denied = requireStepUp(req);
    if (denied) return denied;
  }
  let body: unknown;
  if (req.method !== 'GET') body = await req.json().catch(() => undefined);
  try {
    const result = await adminEmailProxy(activeEnv(), req.method, path, body);
    return NextResponse.json(result.data, { status: result.status });
  } catch (e: any) {
    return NextResponse.json({ message: e?.message ?? 'Proxy failed.' }, { status: 502 });
  }
}

export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
