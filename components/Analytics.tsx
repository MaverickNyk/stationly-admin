'use client';

import { useState } from 'react';
import Toolbar from './ui/Toolbar';
import ErrorBanner from './ui/ErrorBanner';
import { Tile, BarList, PLATFORM_LABEL, pct } from './ui/Insight';
import { relTime, num } from '@/lib/format';
import { useResource } from '@/lib/useResource';
import { eventLabel } from '@/lib/activityText';
import { useConfirmedFetch, StepUpCancelled } from './StepUp';

type Window = { any: number; android: number; ios: number; web: number; both: number };
type Overview = {
  computedAt: number;
  usersRefreshedAt: number;
  totalUsers: number;
  segments: { androidOnly: number; iosOnly: number; both: number; webOnly: number; noDevice: number };
  active: Record<'d1' | 'd7' | 'd30', Window>;
  versions: Record<'android' | 'ios' | 'web', Array<{ version: string; active30: number; all: number }>>;
  signupsByWeek: Array<{ week: string; android: number; ios: number; web: number; unknown: number }>;
  supporters: { ever: number; active: number };
  devices: { total: number; android: number; ios: number; web: number };
};
type Usage = {
  computedAt: number;
  days: number;
  from: string;
  to: string;
  docsRead: number;
  accountsScanned: number;
  activeUsers: Window;
  daily: Array<{ date: string; android: number; ios: number; web: number; opens: number }>;
  events: Array<{ name: string; count: number; users: number; byPlatform: Record<string, number>; breakdown?: Record<string, number> }>;
  funnels: Array<{ key: string; label: string; steps: Array<{ label: string; users: Record<string, number> }> }>;
  versions: Record<string, Array<{ version: string; users: number }>>;
  mirror: { rows: number; oldest: string | null; importedAt: number };
};

const niceDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const prettyValue = (v: string) => {
  const t = v.match(/^t(\d+)$/);
  if (t) return `£${t[1]}`;
  return /^[A-Z]+$/.test(v) ? v.toLowerCase() : v.replace(/_/g, ' ');
};

const SEGMENTS: Array<{ key: keyof Overview['segments']; label: string; color: string }> = [
  { key: 'androidOnly', label: 'Android only', color: 'var(--pf-android)' },
  { key: 'both', label: 'Android and iOS', color: 'var(--amber)' },
  { key: 'iosOnly', label: 'iOS only', color: 'var(--pf-ios)' },
  { key: 'webOnly', label: 'Web only', color: 'var(--pf-web)' },
  { key: 'noDevice', label: 'No device on record', color: 'var(--muted-2)' },
];

export default function Analytics() {
  const ov = useResource<Overview>('/api/admin/x/analytics/overview');
  const [days, setDays] = useState(7);
  const usage = useResource<{ days: number; report: Usage | null }>(`/api/admin/x/analytics/usage?days=${days}`);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const confirmFetch = useConfirmedFetch();
  async function importHistory() {
    setImporting(true);
    setImportMsg('');
    try {
      const r = await confirmFetch<{ docs: number; events: number }>('Import 120 days of activity (one Firestore collection-group read)', '/api/admin/x/analytics/import-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 120 }),
      });
      setImportMsg(`Imported ${num(r.events)} events from ${num(r.docs)} documents.`);
      await usage.reload();
    } catch (e: any) {
      setImportMsg(e instanceof StepUpCancelled ? 'Not imported: the password check was cancelled.' : e?.message ?? 'Import failed');
    } finally {
      setImporting(false);
    }
  }
  const o = ov.data;
  const u = usage.data?.report ?? null;

  return (
    <div>
      {/* ── 1. Devices: free, from the cached users ─────────────────────── */}
      <Toolbar meta={o ? `Accounts refreshed ${relTime(o.usersRefreshedAt)} · refresh them on the Users page` : undefined}>
        <button onClick={() => ov.reload()} disabled={ov.busy}>{ov.busy ? '…' : '↻ Reload'}</button>
      </Toolbar>
      <ErrorBanner message={ov.error} onRetry={() => ov.reload()} busy={ov.busy} />

      <div className="stat-grid">
        <Tile label="Accounts" value={num(o?.totalUsers)} sub={`${num(o?.devices.total)} devices`} />
        <Tile label="On Android and iOS" value={num(o?.segments.both)} sub={o ? `${pct(o.segments.both, o.totalUsers)} of accounts` : ''} />
        <Tile label="Seen in 7 days" value={num(o?.active.d7.any)} sub={o ? `${num(o.active.d7.android)} Android · ${num(o.active.d7.ios)} iOS` : ''} />
        <Tile label="Seen in 30 days" value={num(o?.active.d30.any)} sub={o ? `${num(o.active.d30.both)} on both` : ''} />
        <Tile label="Supporters" value={num(o?.supporters.ever)} sub={o ? `${num(o.supporters.active)} in the last month` : ''} />
      </div>

      <div className="split">
        <div className="card">
          <h2>Which platforms people use</h2>
          {o && (
            <>
              <div className="stack" aria-hidden>
                {SEGMENTS.map((s) => (
                  <span key={s.key} style={{ width: `${(o.segments[s.key] / Math.max(1, o.totalUsers)) * 100}%`, background: s.color }} />
                ))}
              </div>
              <BarList
                rows={SEGMENTS.map((s) => ({
                  label: <><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: s.color, marginRight: 8 }} />{s.label}</>,
                  value: o.segments[s.key],
                  note: pct(o.segments[s.key], o.totalUsers),
                }))}
              />
            </>
          )}
          <p className="note">From each account&apos;s devices. &quot;No device on record&quot; is mostly accounts from before devices were recorded.</p>
        </div>

        <div className="card">
          <h2>Seen recently, by platform</h2>
          {o && (
            <table className="mini">
              <thead><tr><th /><th>Any</th><th>Android</th><th>iOS</th><th>Web</th><th>Both</th></tr></thead>
              <tbody>
                {(['d1', 'd7', 'd30'] as const).map((k) => (
                  <tr key={k}>
                    <td>{k === 'd1' ? '24 hours' : k === 'd7' ? '7 days' : '30 days'}</td>
                    <td><b>{num(o.active[k].any)}</b></td>
                    <td>{num(o.active[k].android)}</td>
                    <td>{num(o.active[k].ios)}</td>
                    <td>{num(o.active[k].web)}</td>
                    <td>{num(o.active[k].both)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="note">From each device&apos;s last sign-in or session refresh, which is written at most about once a day, so short windows read low. &quot;What people did&quot; below counts real use.</p>
        </div>
      </div>

      <div className="split">
        {(['android', 'ios'] as const).map((p) => (
          <div className="card" key={p}>
            <h2>{PLATFORM_LABEL[p]} app versions</h2>
            <BarList
              rows={(o?.versions[p] ?? []).slice(0, 8).map((v) => ({
                label: v.version, value: v.active30, tone: p, note: `active, ${v.all} in all`,
              }))}
              empty="No devices."
            />
            <p className="note">Devices seen in the last 30 days on each version, and every device ever recorded on it.</p>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>New accounts per week, by first platform</h2>
        <table className="mini">
          <thead><tr><th>Week starting</th><th>Total</th><th>Android</th><th>iOS</th><th>Web</th><th>Unknown</th></tr></thead>
          <tbody>
            {(o?.signupsByWeek ?? []).slice(-12).reverse().map((w) => (
              <tr key={w.week}>
                <td className="nowrap">{niceDay(w.week)}</td>
                <td><b>{num(w.android + w.ios + w.web + w.unknown)}</b></td>
                <td>{num(w.android)}</td>
                <td>{num(w.ios)}</td>
                <td>{num(w.web)}</td>
                <td className="muted-2">{num(w.unknown)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note">By the platform of the account&apos;s first device. Weeks with no signups are left out.</p>
      </div>

      {/* ── 2. Activity: real use, costed, cached ───────────────────────── */}
      <h2 className="section-title" style={{ marginTop: 32 }}>What people did</h2>
      <Toolbar
        meta={
          u
            ? `${u.from} to ${u.to} · ${num(u.accountsScanned)} accounts · local copy holds ${num(u.mirror.rows)} events since ${u.mirror.oldest ?? 'now'}`
            : usage.busy ? 'Loading…' : ''
        }
      >
        <div className="seg">
          {[7, 30, 90].map((d) => (
            <button key={d} className={days === d ? 'active' : ''} onClick={() => setDays(d)}>{d} days</button>
          ))}
        </div>
        <button onClick={() => usage.reload()} disabled={usage.busy}>{usage.busy ? '…' : '↻ Reload'}</button>
      </Toolbar>
      <ErrorBanner message={usage.error} onRetry={() => usage.reload()} busy={usage.busy} />
      <p className="note" style={{ marginTop: 0 }}>
        From the backend&apos;s local copy of every upload, so this costs no Firestore reads. Apps upload overnight, so
        today and yesterday are always short.
      </p>
      {u && !u.mirror.importedAt && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>Bring in older activity</h2>
          <p className="note" style={{ marginTop: 0 }}>
            The local copy starts when this version of the backend went live. Importing reads every activity document
            stored before that from Firestore once (one read per device per day of use) and never needs doing again.
          </p>
          <div className="form-row">
            <button onClick={importHistory} disabled={importing}>{importing ? 'Importing…' : 'Import the last 120 days (one time)'}</button>
            {importMsg && <span className="note" style={{ margin: 0 }}>{importMsg}</span>}
          </div>
        </div>
      )}

      {u && (
        <>
          <div className="stat-grid">
            <Tile label="Used the app" value={num(u.activeUsers.any)} sub={`last ${u.days} days`} />
            <Tile label="Android" value={num(u.activeUsers.android)} />
            <Tile label="iOS" value={num(u.activeUsers.ios)} />
            <Tile label="Used both" value={num(u.activeUsers.both)} sub="Android and iOS in the range" />
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h2>Accounts active per day</h2>
            <table className="mini">
              <thead><tr><th>Day</th><th>Android</th><th>iOS</th><th>Web</th><th>App opens</th><th style={{ width: '35%' }} /></tr></thead>
              <tbody>
                {u.daily.slice().reverse().map((d) => {
                  const max = Math.max(1, ...u.daily.map((x) => x.android + x.ios + x.web));
                  return (
                    <tr key={d.date}>
                      <td className="nowrap">{niceDay(d.date)}</td>
                      <td>{num(d.android)}</td>
                      <td>{num(d.ios)}</td>
                      <td>{num(d.web)}</td>
                      <td>{num(d.opens)}</td>
                      <td>
                        <span className="stack" style={{ height: 8, margin: 0 }}>
                          <span style={{ width: `${(d.android / max) * 100}%`, background: 'var(--pf-android)' }} />
                          <span style={{ width: `${(d.ios / max) * 100}%`, background: 'var(--pf-ios)' }} />
                          <span style={{ width: `${(d.web / max) * 100}%`, background: 'var(--pf-web)' }} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="note">Accounts that did anything that day, per platform. Someone on both counts in each. Android logs app opens from 2.0 build 10; earlier builds do not.</p>
          </div>

          <div className="split">
            {u.funnels.map((f) => {
              const top = f.steps[0]?.users.all ?? 0;
              return (
                <div className="card" key={f.key}>
                  <h2>{f.label}</h2>
                  {f.steps.map((s, i) => (
                    <div className="funnel-step" key={i}>
                      <span>{s.label}</span>
                      <span className="barlist-value">
                        <b>{num(s.users.all)}</b>{' '}
                        <span className="muted-2">
                          {pct(s.users.all, top)} · {num(s.users.android ?? 0)} A · {num(s.users.ios ?? 0)} i
                        </span>
                      </span>
                      <span className="barlist-track">
                        <span className="barlist-fill" style={{ width: `${top ? (s.users.all / top) * 100 : 0}%` }} />
                      </span>
                    </div>
                  ))}
                  {f.key === 'support' && <p className="note">Counts people, not taps. iOS does not log the store steps (its purchase flow is native).</p>}
                </div>
              );
            })}
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h2>Every event</h2>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Event</th><th>Count</th><th>People</th><th>Android</th><th>iOS</th><th>Detail</th></tr></thead>
                <tbody>
                  {u.events.map((e) => (
                    <tr key={e.name}>
                      <td>{eventLabel(e.name)}<div className="muted-2 mono" style={{ fontSize: 10.5 }}>{e.name}</div></td>
                      <td>{num(e.count)}</td>
                      <td>{num(e.users)}</td>
                      <td>{num(e.byPlatform.android ?? 0)}</td>
                      <td>{num(e.byPlatform.ios ?? 0)}</td>
                      <td className="muted-2 wide" style={{ fontSize: 12 }}>
                        {e.breakdown
                          ? Object.entries(e.breakdown).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${prettyValue(k)} ${v}`).join(' · ')
                          : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
