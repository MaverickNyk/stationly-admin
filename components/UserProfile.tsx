'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import ErrorBanner from './ui/ErrorBanner';
import ActivityTimeline, { useActivity } from './ActivityTimeline';
import { PlatformBadges, Tile, BarList, money } from './ui/Insight';
import { useUserDetail, platformsOf, lastSeenOf } from './UserDetailModal';
import { relTime, dateTime, toMs, num } from '@/lib/format';
import { categoryOf, CATEGORY_LABEL, type Category } from '@/lib/activityText';

/** Everything about one account on one page. */
export default function UserProfile({ uid }: { uid: string }) {
  const { d, err, busy, retry } = useUserDetail(uid);
  const act = useActivity(uid, 30);

  const summary = useMemo(() => {
    const rows = act.rows ?? [];
    const days = new Set(rows.map((r) => new Date(r.t).toDateString()));
    const opens = rows.filter((r) => r.name === 'app.opened');
    const lastOpen: Record<string, number> = {};
    for (const r of opens) lastOpen[r.platform] = Math.max(lastOpen[r.platform] ?? 0, r.t);
    const byCat: Partial<Record<Category, number>> = {};
    for (const r of rows) { const c = categoryOf(r.name); byCat[c] = (byCat[c] ?? 0) + 1; }
    const problems = rows.filter((r) => ['auth.forced_logout', 'sync.failed', 'app.upgrade_required'].includes(r.name)
      || (r.name === 'support.verified' && !String(r.props.outcome ?? '').includes('credited'))).length;
    return { daysActive: days.size, opens: opens.length, lastOpen, byCat, problems };
  }, [act.rows]);

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <Link href="/users" className="card-link" style={{ marginTop: 0 }}>← All users</Link>
      </div>
      {busy && <p className="empty">Loading…</p>}
      <ErrorBanner message={err} onRetry={retry} busy={busy} />

      {d && (
        <>
          <div className="card">
            <div className="detail-head" style={{ marginBottom: 0, paddingRight: 0 }}>
              <div className="detail-avatar">{(d.displayName || d.email || 'U').charAt(0).toUpperCase()}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h3 style={{ fontSize: 22 }}>{d.displayName || '(no name)'}</h3>
                <div className="detail-email">{d.email}</div>
                <div className="detail-pills">
                  <PlatformBadges platforms={platformsOf(d)} />
                  <span className={`pill ${d.loggedIn ? 'on' : 'off'}`}>{d.loggedIn ? 'Signed in' : 'Signed out'}</span>
                  {d.emailVerified ? <span className="pill verified">Verified</span> : <span className="pill muted">Unverified</span>}
                  {d.signInProvider && <span className="pill muted">{d.signInProvider.replace('.com', '')}</span>}
                </div>
              </div>
              <Link
                className="btn-ghost"
                href={`/notifications?uid=${encodeURIComponent(d.uid)}&name=${encodeURIComponent(d.displayName || d.email)}`}
              >
                Send notification
              </Link>
            </div>
            <div className="detail-grid" style={{ marginTop: 16, marginBottom: 0 }}>
              <div><span>UID</span><code>{d.uid}</code></div>
              <div><span>Joined</span>{dateTime(toMs(d.createdAt))}</div>
              <div><span>Last login</span>{relTime(toMs(d.lastLoggedInTime))}</div>
              <div><span>Account updated</span>{relTime(toMs(d.updatedAt))}</div>
            </div>
          </div>

          <div className="stat-grid" style={{ marginTop: 16 }}>
            <Tile label="Last seen" value={relTime(lastSeenOf(d) || toMs(d.lastLoggedInTime))} sub="any device" />
            <Tile label="Days active" value={num(summary.daysActive)} sub="last 30 days" />
            <Tile label="App opens" value={num(summary.opens)} sub={Object.entries(summary.lastOpen).map(([p, t]) => `${p === 'ios' ? 'iOS' : p} ${relTime(t)}`).join(' · ') || 'last 30 days'} />
            <Tile label="Boards" value={num(d.stations.length)} />
            <Tile label="Support" value={d.support?.count ? money(d.support.totalMinor) : '£0'} sub={d.support?.count ? `${d.support.count} payments, last ${relTime(d.support.lastAtMs)}` : 'never'} />
            <Tile label="Problems" value={num(summary.problems)} sub="forced logouts, sync or payment failures" tone={summary.problems ? 'bad' : undefined} />
          </div>

          <div className="profile-grid" style={{ marginTop: 16 }}>
            <div className="card" style={{ marginTop: 0 }}>
              <h2>Devices ({d.sessions.length})</h2>
              {d.sessions.length ? (
                <div style={{ overflowX: 'auto' }}>
                  <table className="mini">
                    <thead><tr><th>Device</th><th>OS</th><th>App</th><th>First seen</th><th>Last seen</th></tr></thead>
                    <tbody>
                      {d.sessions.map((s) => (
                        <tr key={s.deviceId}>
                          <td><PlatformBadges platforms={s.platform ? [String(s.platform)] : []} /> {s.model || 'Unknown'}<div className="muted-2 mono" style={{ fontSize: 10.5 }}>{s.deviceId}</div></td>
                          <td className="muted">{s.osVersion || '?'}</td>
                          <td>{s.appVersion || '?'}</td>
                          <td className="muted nowrap">{s.firstSeen ? relTime(toMs(s.firstSeen)) : '?'}</td>
                          <td className="nowrap">{s.lastSeen ? relTime(toMs(s.lastSeen)) : '?'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="empty">No devices on record.</p>}
            </div>

            <div className="card" style={{ marginTop: 0 }}>
              <h2>Activity by kind, 30 days</h2>
              <BarList
                rows={(Object.keys(CATEGORY_LABEL) as Category[]).filter((k) => summary.byCat[k]).map((k) => ({ label: CATEGORY_LABEL[k], value: summary.byCat[k]! }))}
                empty={act.busy ? 'Loading…' : 'No activity uploaded in 30 days.'}
              />
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h2>Boards ({d.stations.length})</h2>
            {d.stations.length ? (
              <ul className="detail-stations">
                {d.stations.map((s, i) => (
                  <li key={`${s.id}-${i}`}>
                    <span className="cell-title">{s.name || s.id}</span>
                    {s.line && <span className="pill muted">{s.line}</span>}
                    {s.mode && <span className="pill muted">{s.mode}</span>}
                    {s.direction && <span className="cell-sub">{s.direction}</span>}
                  </li>
                ))}
              </ul>
            ) : <p className="empty">No boards.</p>}
            {(d.legacyStations?.length ?? 0) > 0 && (
              <details style={{ marginTop: 14 }}>
                <summary className="muted" style={{ cursor: 'pointer', fontSize: 13 }}>
                  Old v1 station list on this account ({d.legacyStations!.length}, not counted)
                </summary>
                <p className="note">
                  The v1 app kept a separate list, one entry per line and direction. This account now uses 2.0 boards, which is
                  what the phone shows; these were never cleared.
                </p>
                <ul className="detail-stations">
                  {d.legacyStations!.map((s, i) => (
                    <li key={`l-${s.id}-${i}`}>
                      <span className="muted">{s.name || s.id}</span>
                      {s.line && <span className="pill muted">{s.line}</span>}
                      {s.direction && <span className="cell-sub">{s.direction}</span>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h2>Activity</h2>
            <ActivityTimeline uid={d.uid} />
          </div>
        </>
      )}
    </div>
  );
}
