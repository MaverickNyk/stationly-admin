'use client';

import { useEffect } from 'react';
import { relTime, num, humanDuration } from '@/lib/format';
import { STATUS_LABEL } from '@/lib/health/types';
import type { CheckResult, CheckStatus, HistoryPoint } from '@/lib/health/types';

/** A single check's "last status" detail. For the Syncer check it also renders
 * the rich /sync-status payload carried on `check.data`. */
export default function HealthCheckModal({
  check,
  history,
  uptime,
  onClose,
}: {
  check: CheckResult;
  history: HistoryPoint[];
  uptime?: number;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Rich Syncer payload, when this is the syncer check probed via /sync-status.
  const syncer = check.id === 'syncer' ? (check.data as any) : undefined;
  const failing = check.status === 'down' || check.status === 'degraded';

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div
        className="detail-box"
        role="dialog"
        aria-modal="true"
        aria-label={`${check.label} status`}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="detail-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div className="detail-head" style={{ alignItems: 'flex-start' }}>
          <div>
            <h3>{check.label}</h3>
            <div className="detail-email">
              <code>{check.path}</code>
            </div>
            <div className="detail-pills">
              <span className={`pill ${pillClass(check.status)}`}>
                <span className={`status-dot ${check.status}`} /> {STATUS_LABEL[check.status]}
              </span>
              <span className="pill muted">{check.method}</span>
            </div>
          </div>
        </div>

        <div className="detail-grid">
          <div>
            <span>Expected</span>
            {check.expected}
          </div>
          <div>
            <span>Actual</span>
            {check.httpCode ? `HTTP ${check.httpCode}` : '—'}
          </div>
          <div>
            <span>Latency</span>
            {check.latencyMs ? `${check.latencyMs}ms` : '—'}
          </div>
          <div>
            <span>Uptime (24h)</span>
            {uptime != null ? `${uptime}%` : '—'}
          </div>
          <div>
            <span>Last checked</span>
            {check.checkedAt ? relTime(check.checkedAt) : '—'}
          </div>
          <div>
            <span>State since</span>
            {failing && check.fails > 0 ? `${relTime(check.since)} (${check.fails}×)` : 'stable'}
          </div>
        </div>

        {check.detail && <div className="health-modal-detail">{check.detail}</div>}

        {syncer && <SyncerPanel s={syncer} />}

        <h4 className="detail-section">Recent checks</h4>
        {history.length === 0 ? (
          <p className="empty">No history yet.</p>
        ) : (
          <ul className="health-history">
            {history
              .slice(-24)
              .reverse()
              .map((p, i) => (
                <li key={i}>
                  <span className={`status-dot ${p.status}`} />
                  <span className="cell-title">{STATUS_LABEL[p.status]}</span>
                  <span className="muted">
                    {p.httpCode || '—'} · {p.latencyMs}ms
                  </span>
                  <span className="muted nowrap" style={{ marginLeft: 'auto' }}>
                    {relTime(p.checkedAt)}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const JOBS: ReadonlyArray<readonly [string, string]> = [
  ['Arrivals', 'arrivals'],
  ['Line status', 'lineStatus'],
  ['Station sync', 'stationSync'],
];

/** Rich rendering of the Syncer's /sync-status summary. */
function SyncerPanel({ s }: { s: any }) {
  return (
    <>
      <h4 className="detail-section">Syncer overview</h4>
      <div className="detail-grid">
        <div>
          <span>Strategy</span>
          {s.pollingStrategy ?? '—'}
        </div>
        <div>
          <span>Poll interval</span>
          {s.pollingIntervalMs ? `${Math.round(s.pollingIntervalMs / 1000)}s` : '—'}
        </div>
        <div>
          <span>Uptime</span>
          {s.uptimeMs != null ? humanDuration(s.uptimeMs) : '—'}
        </div>
        <div>
          <span>NAP mode</span>
          {s.napMode ? 'yes — no subscriptions (healthy idle)' : 'no'}
        </div>
      </div>

      <h4 className="detail-section">Latest run per job</h4>
      <div className="health-jobs">
        {JOBS.map(([label, key]) => {
          const r = s.latest?.[key];
          const st = runDot(r);
          return (
            <div key={key} className={`health-job ${st}`}>
              <div className="health-job-head">
                <span className={`status-dot ${st}`} /> {label}
              </div>
              {r ? (
                <div className="health-job-body">
                  <div>
                    <b>{r.status}</b>
                    {r.cycle != null ? ` · #${r.cycle}` : ''}
                  </div>
                  <div className="muted">
                    {r.finishedAt ? relTime(r.finishedAt) : '—'}
                    {r.durationMs != null ? ` · ${r.durationMs}ms` : ''}
                  </div>
                  {key === 'arrivals' && (
                    <div className="muted">
                      {num(r.arrivals)} arrivals · {num(r.stationGroups)} stations · {num(r.fcmQueued)} FCM
                    </div>
                  )}
                  {key === 'lineStatus' && (
                    <div className="muted">
                      {num(r.totalLines)} lines · {num(r.changed)} changed
                    </div>
                  )}
                  {r.errors ? <div className="count-down">{r.errors} errors</div> : null}
                </div>
              ) : (
                <div className="muted">no run recorded yet</div>
              )}
            </div>
          );
        })}
      </div>

      <h4 className="detail-section">Throughput (last 1h / 24h)</h4>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Window</th>
              <th>Job</th>
              <th>Runs</th>
              <th>OK</th>
              <th>NAP</th>
              <th>Bad</th>
              <th>Avg</th>
              <th>FCM</th>
            </tr>
          </thead>
          <tbody>
            {(['last1h', 'last24h'] as const).flatMap((win) =>
              JOBS.map(([label, key]) => {
                const a = s[win]?.[key];
                if (!a) return null;
                return (
                  <tr key={`${win}-${key}`}>
                    <td className="nowrap">{win === 'last1h' ? '1h' : '24h'}</td>
                    <td className="nowrap">{label}</td>
                    <td>{num(a.runs)}</td>
                    <td>{num(a.ok)}</td>
                    <td>{num(a.nap)}</td>
                    <td>{num((a.failed || 0) + (a.partial || 0))}</td>
                    <td className="nowrap">{num(a.avgDurationMs)}ms</td>
                    <td>{num(a.fcm)}</td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>

      <h4 className="detail-section">FCM · writer · retention</h4>
      <div className="detail-grid">
        <div>
          <span>FCM</span>
          {s.fcm
            ? `${s.fcm.enabled ? 'enabled' : 'disabled'} · ${num(s.fcm.totalSent)} sent / ${num(s.fcm.totalFailed)} failed · ${num(s.fcm.pending)} pending`
            : '—'}
        </div>
        <div>
          <span>Writer</span>
          {s.writer
            ? `${num(s.writer.written)} written · ${num(s.writer.dropped)} dropped · queue ${num(s.writer.queueDepth)}`
            : '—'}
        </div>
        <div>
          <span>Rows stored</span>
          {s.retention ? `${num(s.retention.rawRows)} raw · ${num(s.retention.rollupRows)} rollup` : '—'}
        </div>
        <div>
          <span>Retention</span>
          {s.retention
            ? `${humanDuration(s.retention.rawRetentionMs)} → ${humanDuration(s.retention.hourlyRetentionMs)} → ${humanDuration(s.retention.dailyRetentionMs)}`
            : '—'}
        </div>
      </div>
    </>
  );
}

function pillClass(status: CheckStatus): string {
  if (status === 'up') return 'on';
  if (status === 'skipped') return 'muted';
  return 'off';
}

/** A run's status → a status-dot colour. */
function runDot(r: any): CheckStatus {
  if (!r) return 'skipped';
  if (r.status === 'failed') return 'down';
  if (r.status === 'partial') return 'degraded';
  return 'up'; // ok | nap
}
