'use client';

import { useCallback, useEffect, useState } from 'react';
import Toolbar from './ui/Toolbar';
import ErrorBanner from './ui/ErrorBanner';
import { relTime } from '@/lib/format';
import { GROUP_META } from '@/lib/health/registry';
import type { CheckResult, CheckStatus, HealthSnapshot, HistoryPoint } from '@/lib/health/types';

const POLL_MS = 30_000;
const STATUS_LABEL: Record<CheckStatus, string> = {
  up: 'Operational',
  degraded: 'Degraded',
  down: 'Down',
  skipped: 'Not checked',
};

export default function HealthDashboard() {
  const [snap, setSnap] = useState<HealthSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/health');
      const data = await res.json().catch(() => ({}));
      if (res.ok) setSnap(data);
      else setError(data.message || `Failed (${res.status})`);
    } catch (e: any) {
      setError(e?.message ?? 'Network error');
    } finally {
      setBusy(false);
    }
  }, []);

  const runNow = useCallback(async () => {
    setRunning(true);
    setError('');
    try {
      const res = await fetch('/api/admin/health', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setSnap(data);
      else setError(data.message || `Failed (${res.status})`);
    } catch (e: any) {
      setError(e?.message ?? 'Network error');
    } finally {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const rollupFor = (group: string) => snap?.rollups.find((r) => r.group === group);

  return (
    <div>
      <Toolbar>
        <button onClick={runNow} disabled={running || busy}>
          {running ? 'Checking…' : '▶ Run check now'}
        </button>
        <button onClick={load} disabled={busy}>
          {busy ? '…' : '↻ Refresh'}
        </button>
      </Toolbar>

      <ErrorBanner message={error} onRetry={load} busy={busy} />

      <div className="health-summary">
        <span className={`status-dot ${snap?.overall ?? 'skipped'}`} />
        <b>{snap ? STATUS_LABEL[snap.overall] : 'Loading…'}</b>
        {snap && (problems(snap).down > 0 || problems(snap).degraded > 0) && (
          <span className="health-counts">
            {problems(snap).down > 0 && <span className="count-down">{problems(snap).down} down</span>}
            {problems(snap).degraded > 0 && <span className="count-degraded">{problems(snap).degraded} degraded</span>}
          </span>
        )}
        <span className="health-meta">
          {snap?.lastCycleAt
            ? `last checked ${relTime(snap.lastCycleAt)} · every ${Math.round((snap.intervalMs ?? 0) / 60000)}m`
            : 'no checks yet'}
          {snap?.running ? ' · checking now' : ''}
        </span>
      </div>

      {/* Per-service rollup cards */}
      <div className="stat-grid">
        {GROUP_META.map((g) => {
          const r = rollupFor(g.group);
          const status = r?.status ?? 'skipped';
          return (
            <div key={g.group} className={`stat-card health-card ${status}`}>
              <div className="stat-label">
                <span className={`status-dot ${status}`} /> {g.label}
              </div>
              <div className="stat-value">{r ? STATUS_LABEL[status] : '—'}</div>
              <div className="stat-sub">
                {r ? `${r.up}/${r.total} ok${r.degraded ? ` · ${r.degraded} degraded` : ''}${r.down ? ` · ${r.down} down` : ''}${r.skipped ? ` · ${r.skipped} skipped` : ''}` : g.blurb}
              </div>
            </div>
          );
        })}
      </div>

      {/* Per-group endpoint tables */}
      {GROUP_META.map((g) => {
        const checks = (snap?.checks ?? []).filter((c) => c.group === g.group);
        if (!checks.length) return null;
        return (
          <div className="card" key={g.group} style={{ marginTop: 16 }}>
            <h2>
              {g.label}
              <span className="health-blurb">{g.blurb}</span>
            </h2>
            <div className="health-table-wrap">
              <table className="health-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Endpoint</th>
                    <th>Method</th>
                    <th>Expect</th>
                    <th>Actual</th>
                    <th>Latency</th>
                    <th>Uptime (24h)</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {checks.map((c) => (
                    <Row
                      key={c.id}
                      c={c}
                      history={snap?.history?.[c.id] ?? []}
                      uptime={snap?.uptime?.[c.id]}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {snap && (
        <p className="empty" style={{ marginTop: 14 }}>
          Probed server-side every {Math.round((snap.intervalMs ?? 0) / 60000)} minutes — runs whether or not this page
          is open. Note: <code>POST /auth/forgot-password</code> is intentionally not probed (avoids sending reset
          emails / tripping its rate limiter).
        </p>
      )}
    </div>
  );
}

function problems(snap: HealthSnapshot): { down: number; degraded: number } {
  return snap.checks.reduce(
    (acc, c) => {
      if (c.status === 'down') acc.down += 1;
      else if (c.status === 'degraded') acc.degraded += 1;
      return acc;
    },
    { down: 0, degraded: 0 },
  );
}

function Row({ c, history, uptime }: { c: CheckResult; history: HistoryPoint[]; uptime?: number }) {
  const failing = c.status === 'down' || c.status === 'degraded';
  return (
    <tr>
      <td>
        <span className={`status-dot ${c.status}`} title={STATUS_LABEL[c.status]} />
      </td>
      <td>
        <div className="health-ep">{c.label}</div>
        <code className="health-path">{c.path}</code>
      </td>
      <td>
        <span className="pill muted">{c.method}</span>
      </td>
      <td className="health-dim">{c.expected}</td>
      <td>
        {c.httpCode ? c.httpCode : '—'}
        {failing && c.fails > 0 && (
          <div className="health-since">since {relTime(c.since)} ({c.fails}×)</div>
        )}
      </td>
      <td>{c.latencyMs ? `${c.latencyMs}ms` : '—'}</td>
      <td>
        <Sparkline history={history} />
        <span className="health-uptime">{uptime != null ? `${uptime}%` : '—'}</span>
      </td>
      <td className="health-detail">{c.detail}</td>
    </tr>
  );
}

function Sparkline({ history }: { history: HistoryPoint[] }) {
  // Show the most recent ~40 checks as a status strip.
  const points = history.slice(-40);
  return (
    <span className="sparkline">
      {points.map((p, i) => (
        <span key={i} className={`spark ${p.status}`} title={`${p.status} · ${p.httpCode || '—'} · ${p.latencyMs}ms`} />
      ))}
    </span>
  );
}
