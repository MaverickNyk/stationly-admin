'use client';

import { useState } from 'react';
import Link from 'next/link';
import ViewHeader from './ViewHeader';
import UserPicker from './UserPicker';
import { type EnvName } from '@/lib/env';
import type { TokenStats, AdminUser } from '@/lib/backend';

export default function AudienceLookup({ env }: { env: EnvName }) {
  const [picked, setPicked] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; data: TokenStats | { message?: string } } | null>(null);

  async function lookup(uid: string, fresh = false) {
    if (!uid) return;
    setBusy(true);
    if (!fresh) setResult(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(uid)}${fresh ? '?fresh=1' : ''}`);
      const data = await res.json().catch(() => ({}));
      setResult({ ok: res.ok, data });
    } catch (e: any) {
      setResult({ ok: false, data: { message: e?.message ?? 'Network error' } });
    } finally {
      setBusy(false);
    }
  }

  const stats = result?.ok ? (result.data as TokenStats) : null;

  return (
    <div style={{ maxWidth: 620 }}>
      <ViewHeader env={env} />

      <div className="card">
        <h2>Find a user</h2>
        <div className="field">
          <label>Search by email, name or UID</label>
          <UserPicker
            placeholder="e.g. nikhil@…, Nikhil, or a UID"
            onSelect={(u) => {
              setPicked(u);
              lookup(u.uid);
            }}
          />
          <div className="hint">Resolves to the user&apos;s registered device count. Tokens are never shown.</div>
        </div>

        {picked && (
          <div className="picked-user">
            Selected: <b>{picked.displayName || '(no name)'}</b> · {picked.email}
            <span className="cell-sub" style={{ marginLeft: 8 }}>{picked.uid}</span>
          </div>
        )}

        {busy && <p className="empty">Looking up…</p>}

        {result && !busy && (
          <div className={`result ${result.ok ? 'ok' : 'fail'}`}>
            {result.ok && stats ? (
              <>
                {stats.deliverable ? '✅ Deliverable' : '⚠️ No registered devices'}
                <div className="counts">
                  <span>
                    devices <b className={stats.deliverable ? 'ok-n' : 'fail-n'}>{stats.tokenCount}</b>
                  </span>
                  <span style={{ color: 'var(--muted-2)', alignSelf: 'center' }}>
                    {stats.source === 'cache' ? '⚡ from cache (0 reads)' : '📡 live read'}
                  </span>
                </div>
                {!stats.deliverable && (
                  <pre>This user has no FCM tokens — they haven&apos;t registered a device (or haven&apos;t opened the app since install). A `uid` push would be a no-op.</pre>
                )}
                {picked && (
                  <div style={{ display: 'flex', gap: 12, marginTop: 14, alignItems: 'center' }}>
                    <button className="btn-ghost" onClick={() => lookup(picked.uid, true)} disabled={busy}>
                      Force live refresh
                    </button>
                    {stats.deliverable && (
                      <Link
                        className="btn-ghost"
                        href={`/notifications?uid=${encodeURIComponent(picked.uid)}&name=${encodeURIComponent(picked.displayName || picked.email)}`}
                      >
                        Compose to this user →
                      </Link>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                ❌ Lookup failed
                <pre>{JSON.stringify(result.data, null, 2)}</pre>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
