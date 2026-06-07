'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import Toolbar from './ui/Toolbar';
import ErrorBanner from './ui/ErrorBanner';
import GrowthChart from './ui/GrowthChart';
import { relTime, num, toMs } from '@/lib/format';
import { useResource } from '@/lib/useResource';
import { ENV_META, type EnvName } from '@/lib/env';
import { GROUP_META } from '@/lib/health/registry';
import type { DashboardStats, HistoryItem, AdminUser } from '@/lib/backend';
import type { HealthSnapshot } from '@/lib/health/types';

const HEALTH_LABEL: Record<string, string> = {
  up: 'All systems go',
  degraded: 'Degraded',
  down: 'Outage',
  skipped: 'Not checked',
};

export default function Dashboard({ env }: { env: EnvName }) {
  // Each panel is its own resource so a single failure is isolated and can be
  // retried on its own — the rest of the dashboard still renders.
  const stats = useResource<DashboardStats>('/api/admin/data?resource=stats');
  const health = useResource<HealthSnapshot>('/api/admin/health');
  const history = useResource<{ items: HistoryItem[] }>('/api/admin/history?limit=200');
  const users = useResource<{ items: AdminUser[] }>('/api/admin/data?resource=users');

  const busyAny = stats.busy || health.busy || history.busy || users.busy;
  function reloadAll() {
    stats.reload();
    health.reload();
    history.reload();
    users.reload();
  }

  const items = useMemo(() => history.data?.items ?? [], [history.data]);
  const userTimes = useMemo(
    () => (users.data?.items ?? []).map((u) => toMs(u.createdAt)),
    [users.data],
  );

  // Sends bucketed into the last 7 calendar days (from the local audit log).
  const trend = useMemo(() => {
    const days: { label: string; count: number }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const start = d.getTime();
      const end = start + 86_400_000;
      const count = items.filter((h) => h.createdAt >= start && h.createdAt < end).length;
      days.push({ label: d.toLocaleDateString([], { weekday: 'short' }), count });
    }
    return days;
  }, [items]);

  const s = stats.data;

  return (
    <div>
      <Toolbar>
        <button onClick={reloadAll} disabled={busyAny}>
          {busyAny ? '…' : '↻ Refresh'}
        </button>
      </Toolbar>

      {/* ── Platform health — the headline of the dashboard ──────────── */}
      <HealthSummary
        snap={health.data}
        busy={health.busy}
        error={health.error}
        onRetry={() => health.reload()}
      />

      {/* ── Counts ───────────────────────────────────────────────────── */}
      <ErrorBanner message={stats.error} onRetry={() => stats.reload()} busy={stats.busy} />
      <div className="stat-grid">
        <StatCard label="Users" value={num(s?.users.total)} sub={`${num(s?.users.active)} active now`} href="/users" accent />
        <StatCard label="Waitlist" value={num(s?.waitlist.total)} sub="signups" href="/waitlist" accent />
        <StatCard label="Subscribed stations" value={num(s?.subscribedStations)} sub="being watched" href="/stations" accent />
        <StatCard label="Stations" value={num(s?.transport.stations)} sub="in cache" />
        <StatCard label="Lines" value={num(s?.transport.lines)} sub="in cache" />
        <StatCard label="Modes" value={num(s?.transport.modes)} sub="in cache" />
      </div>

      <div className="card" style={{ marginTop: 8, marginBottom: 8 }}>
        <h2>User growth</h2>
        {users.error ? (
          <ErrorBanner message={users.error} onRetry={() => users.reload()} busy={users.busy} />
        ) : (
          <GrowthChart times={userTimes} />
        )}
      </div>

      <div className="grid" style={{ marginTop: 8 }}>
        <div className="card">
          <h2>Sends · last 7 days</h2>
          {history.error ? (
            <ErrorBanner message={history.error} onRetry={() => history.reload()} busy={history.busy} />
          ) : (
            <SendsTrend days={trend} />
          )}

          <h2 style={{ marginTop: 22 }}>Recent sends</h2>
          {s?.recentNotifications?.length ? (
            <ul className="feed">
              {s.recentNotifications.map((n) => (
                <li key={n.id}>
                  <span className={`feed-dot ${n.ok ? 'ok' : 'fail'}`} />
                  <div className="feed-body">
                    <div className="feed-title">
                      {n.severity && <span className={`glyph ${n.severity}`}>●</span>}
                      {n.title || '(no title)'}
                    </div>
                    <div className="feed-meta">
                      {n.audienceSummary} · {relTime(n.createdAt)} ·{' '}
                      {n.ok ? <span className="ok-n">{n.successCount}✓</span> : <span className="fail-n">failed</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">No sends recorded yet on {ENV_META[env].label}.</p>
          )}
          <Link href="/history" className="card-link">View all history →</Link>
        </div>

        <div className="card">
          <h2>Quick actions</h2>
          <div className="actions-col">
            <Link href="/notifications" className="action-tile">
              <b>Send a notification</b>
              <span>Compose &amp; broadcast a push</span>
            </Link>
            <Link href="/users" className="action-tile">
              <b>Browse users</b>
              <span>Profiles, sessions, stations</span>
            </Link>
          </div>
          {s && (
            <p className="empty" style={{ marginTop: 14 }}>
              Users data {s.users.refreshedAt ? `refreshed ${relTime(s.users.refreshedAt)}` : 'not loaded yet'} · served from local cache (0 Firestore reads)
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function HealthSummary({
  snap,
  busy,
  error,
  onRetry,
}: {
  snap: HealthSnapshot | null;
  busy: boolean;
  error: string;
  onRetry: () => void;
}) {
  if (error) return <ErrorBanner message={error} onRetry={onRetry} busy={busy} />;
  if (!snap) return <div className="health-banner skeleton-banner" aria-busy="true">Checking platform health…</div>;

  const downCount = snap.checks.filter((c) => c.status === 'down').length;
  const degradedCount = snap.checks.filter((c) => c.status === 'degraded').length;

  return (
    <section className="health-summary-block">
      <Link href="/health" className={`health-banner ${snap.overall}`}>
        <span className={`status-dot ${snap.overall}`} />
        <b>Platform: {HEALTH_LABEL[snap.overall] ?? snap.overall}</b>
        {(downCount > 0 || degradedCount > 0) && (
          <span className="health-banner-counts">
            {downCount > 0 && <span className="count-down">{downCount} down</span>}
            {degradedCount > 0 && <span className="count-degraded">{degradedCount} degraded</span>}
          </span>
        )}
        <span className="health-banner-meta">
          {snap.lastCycleAt ? `checked ${relTime(snap.lastCycleAt)}` : 'no checks yet'} · view health →
        </span>
      </Link>

      <div className="svc-grid">
        {GROUP_META.map((g) => {
          const r = snap.rollups.find((x) => x.group === g.group);
          const status = r?.status ?? 'skipped';
          return (
            <Link href="/health" key={g.group} className={`svc-chip ${status}`} title={g.blurb}>
              <span className={`status-dot ${status}`} />
              <span className="svc-name">{g.label}</span>
              <span className="svc-count">{r ? `${r.up}/${r.total}` : '—'}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function SendsTrend({ days }: { days: { label: string; count: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((sum, d) => sum + d.count, 0);
  return (
    <div>
      <div className="trend">
        {days.map((d, i) => (
          <div
            key={i}
            className={`trend-bar${d.count === 0 ? ' empty' : ''}`}
            style={{ height: `${Math.max(4, Math.round((d.count / max) * 100))}%` }}
            title={`${d.label}: ${d.count} send${d.count === 1 ? '' : 's'}`}
          />
        ))}
      </div>
      <div className="trend-axis">
        {days.map((d, i) => (
          <span key={i}>{d.label[0]}</span>
        ))}
      </div>
      <p className="empty" style={{ marginTop: 6 }}>
        {total} send{total === 1 ? '' : 's'} in the last 7 days
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  href,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  href?: string;
  accent?: boolean;
}) {
  const inner = (
    <div className={`stat-card${accent ? ' accent' : ''}${href ? ' clickable' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
