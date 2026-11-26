'use client';

import Toolbar from './ui/Toolbar';
import ErrorBanner from './ui/ErrorBanner';
import Link from 'next/link';
import { Tile, BarList, PlatformBadges, money, pct } from './ui/Insight';
import { relTime, dateTime, num } from '@/lib/format';
import { useResource } from '@/lib/useResource';

type Bucket = { minor: number; count: number };
type Month = { month: string; raisedMinor: number; count: number; bySource: Record<string, Bucket>; byPlatform?: Record<string, Bucket> };
type Payment = { atMs: number; amountMinor: number; source: string; platform: string; uid: string | null; name: string | null };
type Summary = {
  costMinor: number;
  currency: string;
  thisMonth: string;
  months: Month[];
  supporters: Array<{ uid: string; email: string; displayName: string; platforms?: string[]; count: number; totalMinor: number; lastAtMs: number }>;
  recent?: Payment[];
  allTime?: Record<string, Bucket>;
};

const monthName = (m?: string) =>
  m ? new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : 'this month';

const SOURCE: Record<string, string> = { google: 'Google Play', apple: 'App Store', stripe: 'Card (Stripe) in an app', web: 'Website' };
const PLATFORMS: Array<{ key: string; label: string; color: string }> = [
  { key: 'android', label: 'Android', color: 'var(--pf-android)' },
  { key: 'ios', label: 'iOS', color: 'var(--pf-ios)' },
  { key: 'web', label: 'Website', color: 'var(--pf-web)' },
  { key: 'app', label: 'App, platform unclear', color: 'var(--muted-2)' },
];
const PF_LABEL: Record<string, string> = Object.fromEntries(PLATFORMS.map((p) => [p.key, p.label]));

export default function SupportMoney() {
  const { data, busy, error, reload } = useResource<Summary>('/api/admin/x/support/summary?months=6');
  const cur = data?.months.find((m) => m.month === data.thisMonth);
  const cost = data?.costMinor ?? 0;
  const lapsedCutoff = Date.now() - 31 * 24 * 3600_000;

  return (
    <div>
      <Toolbar meta={data ? `${num(data.supporters.length)} accounts have contributed` : undefined}>
        <button onClick={() => reload()} disabled={busy}>{busy ? '…' : '↻ Reload'}</button>
      </Toolbar>
      <ErrorBanner message={error} onRetry={() => reload()} busy={busy} />

      <div className="stat-grid">
        <Tile label={`Given in ${monthName(data?.thisMonth)}`} value={money(cur?.raisedMinor)} sub={`${num(cur?.count)} payments`} />
        <Tile label="Monthly running cost" value={cost ? money(cost) : 'not set'} sub={cost ? `${pct(cur?.raisedMinor ?? 0, cost)} reached` : 'SUPPORT_MONEY_MONTHLY_COST_MINOR'} />
        <Tile label="Supporters" value={num(data?.supporters.length)} sub={`${num(data?.supporters.filter((s) => s.lastAtMs > lapsedCutoff).length)} in the last month`} />
      </div>

      {cost > 0 && cur && (
        <div className="card" style={{ marginTop: 8 }}>
          <h2>This month against the running cost</h2>
          <div className="progress"><span style={{ width: `${Math.min(100, (cur.raisedMinor / cost) * 100)}%` }} /></div>
          <p className="note">{money(cur.raisedMinor)} of {money(cost)}. Gross, before the stores take their share.</p>
        </div>
      )}

      <div className="split">
        <div className="card">
          <h2>By platform, {monthName(data?.thisMonth)}</h2>
          {cur && cur.raisedMinor > 0 && (
            <div className="stack" aria-hidden>
              {PLATFORMS.map((p) => (
                <span key={p.key} style={{ width: `${((cur.byPlatform?.[p.key]?.minor ?? 0) / cur.raisedMinor) * 100}%`, background: p.color }} />
              ))}
            </div>
          )}
          <BarList
            rows={PLATFORMS.filter((p) => cur?.byPlatform?.[p.key]).map((p) => ({
              label: <><i className="swatch" style={{ background: p.color }} />{p.label}</>,
              value: cur!.byPlatform![p.key].minor,
              note: `${cur!.byPlatform![p.key].count} payments`,
            }))}
            format={money}
            empty="No payments this month yet."
          />
          <p className="note">
            Play is Android and the App Store is iOS. A card payment made inside an app is matched to the payer&apos;s
            devices; someone on both platforms shows as unclear.
          </p>
        </div>
        <div className="card">
          <h2>By route, {monthName(data?.thisMonth)}</h2>
          <BarList
            rows={Object.entries(cur?.bySource ?? {}).map(([k, v]) => ({ label: SOURCE[k] ?? k, value: v.minor, note: `${v.count} payments` }))}
            format={money}
            empty="No payments this month yet."
          />
          <p className="note">GBP only. Gross, before the stores take their share.</p>
        </div>
      </div>

      {data?.allTime && Object.keys(data.allTime).length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>All time, by platform</h2>
          <BarList
            rows={PLATFORMS.filter((p) => data.allTime![p.key]).map((p) => ({
              label: <><i className="swatch" style={{ background: p.color }} />{p.label}</>,
              value: data.allTime![p.key].minor,
              note: `${data.allTime![p.key].count} payments`,
            }))}
            format={money}
          />
          <p className="note">
            Every payment on record, from each account&apos;s own history plus the website. It goes back further than the
            monthly totals and includes store test purchases, so it can be higher than the months added up.
          </p>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h2>By month and platform</h2>
        <div style={{ overflowX: 'auto' }}>
          <table className="mini">
            <thead>
              <tr><th>Month</th><th>Total</th>{PLATFORMS.map((p) => <th key={p.key}>{p.label}</th>)}<th>Payments</th></tr>
            </thead>
            <tbody>
              {(data?.months ?? []).slice().reverse().map((m) => (
                <tr key={m.month}>
                  <td className="nowrap">{monthName(m.month)}</td>
                  <td><b>{money(m.raisedMinor)}</b></td>
                  {PLATFORMS.map((p) => <td key={p.key} className={m.byPlatform?.[p.key] ? '' : 'muted-2'}>{money(m.byPlatform?.[p.key]?.minor ?? 0)}</td>)}
                  <td>{num(m.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Latest payments, all time</h2>
        {data?.recent?.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="mini">
              <thead><tr><th>When</th><th>Amount</th><th>Platform</th><th>Route</th><th>Who</th></tr></thead>
              <tbody>
                {data.recent.map((p, i) => (
                  <tr key={i}>
                    <td className="nowrap" title={dateTime(p.atMs)}>{relTime(p.atMs)}</td>
                    <td><b>{money(p.amountMinor)}</b></td>
                    <td>{p.platform === 'app' || p.platform === 'web' ? <span className="muted">{PF_LABEL[p.platform]}</span> : <PlatformBadges platforms={[p.platform]} />}</td>
                    <td className="muted">{SOURCE[p.source] ?? p.source}</td>
                    <td>{p.uid ? <Link href={`/users/${encodeURIComponent(p.uid)}`}>{p.name || p.uid}</Link> : <span className="muted-2">no account</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">No payments on record.</p>
        )}
      </div>

      <div className="card table-card" style={{ marginTop: 16 }}>
        <table className="data-table">
          <thead><tr><th>Supporter</th><th>Platforms</th><th>Payments</th><th>Total</th><th>Last</th><th>Badge</th></tr></thead>
          <tbody>
            {(data?.supporters ?? []).map((s) => (
              <tr key={s.uid}>
                <td><Link href={`/users/${encodeURIComponent(s.uid)}`}>{s.displayName || s.email || s.uid}</Link><div className="muted" style={{ fontSize: 12 }}>{s.email}</div></td>
                <td className="nowrap"><PlatformBadges platforms={s.platforms} /></td>
                <td>{num(s.count)}</td>
                <td>{money(s.totalMinor)}</td>
                <td className="nowrap" title={dateTime(s.lastAtMs)}>{relTime(s.lastAtMs)}</td>
                <td>{s.lastAtMs > lapsedCutoff ? <span className="pill on">active</span> : <span className="pill off">lapsed</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && !data.supporters.length && <p className="empty empty-pad">Nobody has contributed yet.</p>}
      </div>
      <p className="note">Supporters come from the cached accounts; refresh them on the Users page for the latest.</p>
    </div>
  );
}
