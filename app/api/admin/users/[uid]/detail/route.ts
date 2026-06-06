import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isValidSessionValue, SESSION_COOKIE } from '@/lib/session';
import { getUserDetail } from '@/lib/backend';
import { activeEnv } from '@/lib/env';

export const runtime = 'nodejs';

/** Proxy: full user detail (profile + sessions + stations). Session-gated. */
export async function GET(_req: Request, { params }: { params: { uid: string } }) {
  const session = cookies().get(SESSION_COOKIE)?.value;
  if (!(await isValidSessionValue(session))) {
    return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });
  }
  const uid = (params.uid || '').trim();
  if (!uid) return NextResponse.json({ message: 'uid is required.' }, { status: 400 });

  try {
    const result = await getUserDetail(activeEnv(), uid);
    return NextResponse.json(result.data, { status: result.status });
  } catch (e: any) {
    return NextResponse.json({ message: e?.message ?? 'Proxy failed.' }, { status: 502 });
  }
}
