'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ErrorBanner from './ui/ErrorBanner';
import { relTime, dateTime, toMs } from '@/lib/format';
import type { UserDetail } from '@/lib/backend';

export default function UserDetailModal({ uid, onClose }: { uid: string; onClose: () => void }) {
  const [d, setD] = useState<UserDetail | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(true);
  const [nonce, setNonce] = useState(0); // bump to re-fetch (Retry)

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setBusy(true);
      setErr('');
      try {
        const r = await fetch(`/api/admin/users/${encodeURIComponent(uid)}/detail`);
        const j = await r.json().catch(() => ({}));
        if (!alive) return;
        if (r.ok) setD(j);
        else setErr(j.message || `Failed (${r.status})`);
      } catch (e: any) {
        if (alive) setErr(e?.message ?? 'Network error');
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [uid, nonce]);

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="detail-box" role="dialog" aria-modal="true" aria-label="User details" onClick={(e) => e.stopPropagation()}>
        <button className="detail-close" onClick={onClose} aria-label="Close">✕</button>

        {busy && <p className="empty" style={{ padding: 20 }}>Loading…</p>}
        <ErrorBanner message={err} onRetry={() => setNonce((n) => n + 1)} busy={busy} />

        {d && (
          <>
            <div className="detail-head">
              <div className="detail-avatar">{(d.displayName || d.email || 'U').charAt(0).toUpperCase()}</div>
              <div>
                <h3>{d.displayName || '(no name)'}</h3>
                <div className="detail-email">{d.email}</div>
                <div className="detail-pills">
                  <span className={`pill ${d.loggedIn ? 'on' : 'off'}`}>{d.loggedIn ? 'Active' : 'Offline'}</span>
                  {d.emailVerified ? <span className="pill verified">Verified</span> : <span className="pill muted">Unverified</span>}
                  {d.signInProvider && <span className="pill muted">{d.signInProvider}</span>}
                </div>
              </div>
            </div>

            <div className="detail-grid">
              <div><span>UID</span><code>{d.uid}</code></div>
              <div><span>Joined</span>{dateTime(toMs(d.createdAt))}</div>
              <div><span>Last seen</span>{relTime(toMs(d.lastLoggedInTime))}</div>
              <div><span>Updated</span>{relTime(toMs(d.updatedAt))}</div>
            </div>

            <h4 className="detail-section">Devices &amp; sessions ({d.sessions.length})</h4>
            {d.sessions.length === 0 ? (
              <p className="empty">No active device sessions.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr><th>Device</th><th>Platform</th><th>App</th><th className="nowrap">Last seen</th></tr>
                  </thead>
                  <tbody>
                    {d.sessions.map((s) => (
                      <tr key={s.deviceId}>
                        <td>
                          <div className="cell-title">{s.model || 'Unknown device'}</div>
                          <div className="cell-sub">{s.deviceId}</div>
                        </td>
                        <td className="nowrap">{[s.platform, s.osVersion].filter(Boolean).join(' · ') || '—'}</td>
                        <td className="nowrap">{s.appVersion || '—'}</td>
                        <td className="muted nowrap">{s.lastSeen ? relTime(Date.parse(s.lastSeen)) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h4 className="detail-section">Subscribed stations ({d.stations.length})</h4>
            {d.stations.length === 0 ? (
              <p className="empty">No subscribed stations.</p>
            ) : (
              <ul className="detail-stations">
                {d.stations.map((s, i) => (
                  <li key={`${s.id}-${i}`}>
                    <span className="cell-title">{s.name || s.id}</span>
                    <span className="pill muted">{s.line}</span>
                    <span className="pill muted">{s.mode}</span>
                    {s.direction && <span className="cell-sub">{s.direction}</span>}
                  </li>
                ))}
              </ul>
            )}

            <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
              <Link
                className="btn-ghost"
                href={`/notifications?uid=${encodeURIComponent(d.uid)}&name=${encodeURIComponent(d.displayName || d.email)}`}
              >
                Send notification to this user →
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
