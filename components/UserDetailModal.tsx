'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import ErrorBanner from './ui/ErrorBanner';
import ActivityTimeline from './ActivityTimeline';
import { PlatformBadges, money } from './ui/Insight';
import { relTime, dateTime, toMs } from '@/lib/format';
import type { UserDetail } from '@/lib/backend';

/** Loads one account's detail (served from the backend's cache, no Firestore read). */
export function useUserDetail(uid: string) {
  const [d, setD] = useState<UserDetail | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(true);
  const [nonce, setNonce] = useState(0);
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
    return () => { alive = false; };
  }, [uid, nonce]);
  return { d, err, busy, retry: () => setNonce((n) => n + 1) };
}

export const platformsOf = (d: UserDetail) => [...new Set(d.sessions.map((s) => String(s.platform ?? '').toLowerCase()).filter(Boolean))].sort();
export const lastSeenOf = (d: UserDetail) => Math.max(0, ...d.sessions.map((s) => toMs(s.lastSeen ?? 0)));

/**
 * A short summary of one account. Everything else is on the full page
 * (/users/<uid>). Rendered into <body> so it is centred on the screen however
 * the page underneath is scrolled or animated.
 */
export default function UserDetailModal({ uid, onClose }: { uid: string; onClose: () => void }) {
  const { d, err, busy, retry } = useUserDetail(uid);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="confirm-overlay" onClick={onClose}>
      <div className="detail-box compact" role="dialog" aria-modal="true" aria-label="User details" onClick={(e) => e.stopPropagation()}>
        <button className="detail-close" onClick={onClose} aria-label="Close">✕</button>

        {busy && <p className="empty" style={{ padding: 20 }}>Loading…</p>}
        <ErrorBanner message={err} onRetry={retry} busy={busy} />

        {d && (
          <>
            <div className="detail-head" style={{ marginBottom: 6 }}>
              <div className="detail-avatar">{(d.displayName || d.email || 'U').charAt(0).toUpperCase()}</div>
              <div style={{ minWidth: 0 }}>
                <h3>{d.displayName || '(no name)'}</h3>
                <div className="detail-email">{d.email}</div>
                <div className="detail-pills">
                  <PlatformBadges platforms={platformsOf(d)} />
                  <span className={`pill ${d.loggedIn ? 'on' : 'off'}`}>{d.loggedIn ? 'Signed in' : 'Signed out'}</span>
                  {d.signInProvider && <span className="pill muted">{d.signInProvider.replace('.com', '')}</span>}
                </div>
              </div>
            </div>

            <div className="facts">
              <div className="fact"><span>Last seen</span><b>{relTime(lastSeenOf(d) || toMs(d.lastLoggedInTime))}</b></div>
              <div className="fact"><span>Joined</span><b title={dateTime(toMs(d.createdAt))}>{relTime(toMs(d.createdAt))}</b></div>
              <div className="fact"><span>Boards</span><b>{d.stations.length}</b></div>
              <div className="fact"><span>Support</span><b>{d.support?.count ? money(d.support.totalMinor) : 'none'}</b></div>
            </div>

            <div className="detail-section">Devices ({d.sessions.length})</div>
            {d.sessions.length ? (
              <div className="devlist">
                {d.sessions.map((s) => (
                  <div key={s.deviceId}>
                    <PlatformBadges platforms={s.platform ? [String(s.platform)] : []} />
                    <span className="grow">{s.model || 'Unknown device'}</span>
                    <span className="muted">{s.appVersion || '?'}</span>
                    <span className="muted-2">{s.lastSeen ? relTime(toMs(s.lastSeen)) : ''}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty">No devices on record.</p>
            )}

            <div className="detail-section">Recent activity</div>
            <ActivityTimeline uid={d.uid} compact limit={8} />

            <div className="dialog-actions">
              <Link className="btn-primary" href={`/users/${encodeURIComponent(d.uid)}`}>Open full profile →</Link>
              <Link
                className="btn-ghost"
                href={`/notifications?uid=${encodeURIComponent(d.uid)}&name=${encodeURIComponent(d.displayName || d.email)}`}
              >
                Send notification
              </Link>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
