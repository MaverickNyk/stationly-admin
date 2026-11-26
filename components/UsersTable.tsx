'use client';

import { useMemo, useState } from 'react';
import UserDetailModal from './UserDetailModal';
import Toolbar from './ui/Toolbar';
import DataCard from './ui/DataCard';
import SortTh from './ui/SortTh';
import Pager from './ui/Pager';
import ErrorBanner from './ui/ErrorBanner';
import GrowthChart from './ui/GrowthChart';
import { PlatformBadges, money } from './ui/Insight';
import { relTime, dateTime, toMs } from '@/lib/format';
import { fetchJson, useResource } from '@/lib/useResource';
import { useSort } from '@/lib/useSort';
import { usePaged } from '@/lib/usePaged';
import { downloadCsv } from '@/lib/csv';
import { ENV_META, type EnvName } from '@/lib/env';
import type { AdminUser } from '@/lib/backend';

type Segment = 'all' | 'both' | 'android' | 'ios' | 'v1' | 'supporters' | 'none';
const has = (u: AdminUser, p: string) => (u.platforms ?? []).includes(p);
const SEGMENT_TEST: Record<Segment, (u: AdminUser) => boolean> = {
  all: () => true,
  both: (u) => has(u, 'android') && has(u, 'ios'),
  android: (u) => has(u, 'android') && !has(u, 'ios'),
  ios: (u) => has(u, 'ios') && !has(u, 'android'),
  // Android 2.0 is versionName 2.x; anything below on their newest Android device is still on v1.
  v1: (u) => has(u, 'android') && !!u.versions?.android && !/^([2-9]|\d{2,})\./.test(u.versions.android),
  supporters: (u) => (u.support?.count ?? 0) > 0,
  none: (u) => !(u.platforms ?? []).length,
};
// ── Custom filters (combine with the quick segment and the search) ──────
const DAY = 864e5;
type Filters = {
  platform: '' | 'android' | 'ios' | 'web' | 'both' | 'none';
  version: string;
  signedIn: '' | 'yes' | 'no';
  verified: '' | 'yes' | 'no';
  provider: string;
  supporter: '' | 'yes' | 'no';
  boards: '' | '0' | '1' | '3' | '5';
  seen: '' | '1' | '7' | '30' | 'gt30' | 'never';
  joined: '' | '7' | '30' | '90' | 'gt90';
};
const NO_FILTERS: Filters = { platform: '', version: '', signedIn: '', verified: '', provider: '', supporter: '', boards: '', seen: '', joined: '' };
const seenAt = (u: AdminUser) => Math.max(toMs(u.lastSeen ?? 0), toMs(u.lastLoggedInTime));
const versionsOf = (u: AdminUser) => Object.entries(u.versions ?? {}).map(([p, v]) => `${p}:${v}`);

function passes(u: AdminUser, f: Filters, now: number): boolean {
  const pf = u.platforms ?? [];
  if (f.platform === 'both' && !(pf.includes('android') && pf.includes('ios'))) return false;
  if (f.platform === 'none' && pf.length) return false;
  if (['android', 'ios', 'web'].includes(f.platform) && !pf.includes(f.platform)) return false;
  if (f.version && !versionsOf(u).includes(f.version)) return false;
  if (f.signedIn && u.loggedIn !== (f.signedIn === 'yes')) return false;
  if (f.verified && u.emailVerified !== (f.verified === 'yes')) return false;
  if (f.provider && (u.signInProvider || 'unknown') !== f.provider) return false;
  if (f.supporter && ((u.support?.count ?? 0) > 0) !== (f.supporter === 'yes')) return false;
  if (f.boards === '0' && u.stationCount !== 0) return false;
  if (f.boards && f.boards !== '0' && u.stationCount < Number(f.boards)) return false;
  const seen = seenAt(u);
  if (f.seen === 'never' && seen) return false;
  if (f.seen === 'gt30' && (!seen || now - seen < 30 * DAY)) return false;
  if (['1', '7', '30'].includes(f.seen) && (!seen || now - seen > Number(f.seen) * DAY)) return false;
  const joined = toMs(u.createdAt);
  if (f.joined === 'gt90' && now - joined < 90 * DAY) return false;
  if (['7', '30', '90'].includes(f.joined) && now - joined > Number(f.joined) * DAY) return false;
  return true;
}

const SEGMENTS: Array<{ key: Segment; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'both', label: 'Android and iOS' },
  { key: 'android', label: 'Android only' },
  { key: 'ios', label: 'iOS only' },
  { key: 'v1', label: 'Android still on v1' },
  { key: 'supporters', label: 'Supporters' },
  { key: 'none', label: 'No device' },
];

type UsersPayload = { items: AdminUser[]; refreshedAt: number; cached: boolean };

export default function UsersTable({ env }: { env: EnvName }) {
  const { data, busy, error, reload, setData } = useResource<UsersPayload>(
    '/api/admin/data?resource=users',
    '/api/admin/data?resource=users&refresh=1',
  );
  const [fullBusy, setFullBusy] = useState(false);
  const [fullErr, setFullErr] = useState('');
  async function fullReload() {
    setFullBusy(true);
    setFullErr('');
    try {
      setData(await fetchJson<UsersPayload>('/api/admin/data?resource=users&full=1'));
    } catch (e: any) {
      setFullErr(e?.message ?? 'Full resync failed');
    } finally {
      setFullBusy(false);
    }
  }
  const [openUid, setOpenUid] = useState<string | null>(null);
  const [confirmFull, setConfirmFull] = useState(false);
  const sync = useResource<{ changedWaiting: number }>('/api/admin/x/sync-status');
  const [q, setQ] = useState('');
  const [seg, setSeg] = useState<Segment>('all');
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const activeFilters = Object.values(f).filter(Boolean).length;
  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLSelectElement>) => { setF((x) => ({ ...x, [k]: e.target.value })); setPage(1); };

  const items = useMemo(() => data?.items ?? [], [data]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const now = Date.now();
    const inSeg = items.filter((u) => SEGMENT_TEST[seg](u) && passes(u, f, now));
    if (!s) return inSeg;
    return inSeg.filter(
      (u) =>
        u.email.toLowerCase().includes(s) ||
        u.displayName.toLowerCase().includes(s) ||
        u.uid.toLowerCase().includes(s),
    );
  }, [items, q, seg, f]);
  const versionOptions = useMemo(() => [...new Set(items.flatMap(versionsOf))].sort(), [items]);
  const providerOptions = useMemo(() => [...new Set(items.map((u) => u.signInProvider || 'unknown'))].sort(), [items]);

  const { sorted, key, dir, onSort } = useSort<AdminUser>(filtered, {
    user: (u) => (u.displayName || u.email || u.uid).toLowerCase(),
    status: (u) => (u.loggedIn ? 1 : 0),
    stations: (u) => u.stationCount,
    lastSeen: (u) => Math.max(toMs(u.lastSeen ?? 0), toMs(u.lastLoggedInTime)),
    joined: (u) => toMs(u.createdAt),
  });
  const { slice, page, pageCount, setPage } = usePaged(sorted, 50);

  function exportCsv() {
    downloadCsv(
      `users-${env}.csv`,
      ['email', 'displayName', 'uid', 'signInProvider', 'platforms', 'androidVersion', 'iosVersion', 'loggedIn', 'emailVerified', 'stationCount', 'supportPayments', 'supportTotalGBP', 'lastSeen', 'lastLoggedIn', 'joined'],
      filtered.map((u) => [
        u.email,
        u.displayName,
        u.uid,
        u.signInProvider ?? '',
        (u.platforms ?? []).join(' '),
        u.versions?.android ?? '',
        u.versions?.ios ?? '',
        u.loggedIn,
        u.emailVerified,
        u.stationCount,
        u.support?.count ?? 0,
        ((u.support?.totalMinor ?? 0) / 100).toFixed(2),
        u.lastSeen ? new Date(u.lastSeen).toISOString() : '',
        u.lastLoggedInTime ? new Date(u.lastLoggedInTime).toISOString() : '',
        u.createdAt ? new Date(u.createdAt).toISOString() : '',
      ]),
    );
  }

  return (
    <div>
      {items.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h2>User growth</h2>
          <GrowthChart times={items.map((u) => toMs(u.createdAt))} />
        </div>
      )}

      <Toolbar
        search={{ value: q, onChange: setQ, placeholder: 'Search email, name or UID…' }}
        meta={
          <>
            {filtered.length} of {items.length} ·{' '}
            {data?.refreshedAt
              ? `${data.cached ? '⚡ cached, ' : ''}refreshed ${relTime(data.refreshedAt)}`
              : 'from local cache'}
          </>
        }
      >
        <button onClick={exportCsv} disabled={!filtered.length} title="Download the filtered list as CSV">
          ⬇ CSV
        </button>
        <button
          onClick={async () => { await reload(true); sync.reload(); }}
          disabled={busy}
          title="Re-reads only the accounts that changed since the last sync (it also runs by itself every hour)"
        >
          {busy ? '…' : `↻ Sync changes${sync.data ? ` (${sync.data.changedWaiting})` : ''}`}
        </button>
        {confirmFull ? (
          <>
            <button className="btn-ghost" onClick={() => setConfirmFull(false)}>Cancel</button>
            <button
              onClick={async () => { setConfirmFull(false); await fullReload(); sync.reload(); }}
              disabled={busy}
              title="Reads every account and device from Firestore"
            >
              Yes, read all {items.length} accounts
            </button>
          </>
        ) : (
          <button className="btn-ghost" onClick={() => setConfirmFull(true)} disabled={busy} title="Only needed if something looks wrong">
            Full resync
          </button>
        )}
      </Toolbar>

      <div className="seg" style={{ marginBottom: 14 }}>
        {SEGMENTS.map((sg) => (
          <button key={sg.key} className={seg === sg.key ? 'active' : ''} onClick={() => { setSeg(sg.key); setPage(1); }}>
            {sg.label} <span className="muted-2">{items.filter((u) => SEGMENT_TEST[sg.key](u)).length}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <button className={activeFilters ? 'btn-ghost active-filter' : 'btn-ghost'} onClick={() => setShowFilters((v) => !v)}>
          {showFilters ? '▾' : '▸'} Filters{activeFilters ? ` (${activeFilters})` : ''}
        </button>
        {activeFilters > 0 && <button className="btn-ghost" onClick={() => { setF(NO_FILTERS); setPage(1); }}>Clear filters</button>}
        <span className="muted-2" style={{ fontSize: 12 }}>Filters combine with the segment above and the search.</span>
      </div>
      {showFilters && (
        <div className="card filters-panel">
          <label>Platform
            <select value={f.platform} onChange={set('platform')}>
              <option value="">Any</option><option value="android">Has Android</option><option value="ios">Has iOS</option>
              <option value="web">Has web</option><option value="both">Android and iOS</option><option value="none">No device</option>
            </select>
          </label>
          <label>App version
            <select value={f.version} onChange={set('version')}>
              <option value="">Any</option>
              {versionOptions.map((v) => <option key={v} value={v}>{v.replace('android:', 'Android ').replace('ios:', 'iOS ')}</option>)}
            </select>
          </label>
          <label>Last seen
            <select value={f.seen} onChange={set('seen')}>
              <option value="">Any time</option><option value="1">Last 24 hours</option><option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option><option value="gt30">Not for 30+ days</option><option value="never">Never</option>
            </select>
          </label>
          <label>Joined
            <select value={f.joined} onChange={set('joined')}>
              <option value="">Any time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option><option value="gt90">Over 90 days ago</option>
            </select>
          </label>
          <label>Boards
            <select value={f.boards} onChange={set('boards')}>
              <option value="">Any</option><option value="0">None</option><option value="1">1 or more</option>
              <option value="3">3 or more</option><option value="5">5 or more</option>
            </select>
          </label>
          <label>Signed in
            <select value={f.signedIn} onChange={set('signedIn')}><option value="">Any</option><option value="yes">Yes</option><option value="no">No</option></select>
          </label>
          <label>Email verified
            <select value={f.verified} onChange={set('verified')}><option value="">Any</option><option value="yes">Yes</option><option value="no">No</option></select>
          </label>
          <label>Sign-in method
            <select value={f.provider} onChange={set('provider')}>
              <option value="">Any</option>
              {providerOptions.map((p) => <option key={p} value={p}>{p.replace('.com', '')}</option>)}
            </select>
          </label>
          <label>Supporter
            <select value={f.supporter} onChange={set('supporter')}><option value="">Any</option><option value="yes">Has paid</option><option value="no">Never paid</option></select>
          </label>
        </div>
      )}

      <ErrorBanner message={error || fullErr} onRetry={() => reload()} busy={busy || fullBusy} />

      <DataCard
        loading={busy && !items.length}
        isEmpty={!filtered.length}
        emptyText={`No users ${q ? 'match your search' : `cached for ${ENV_META[env].label}. Hit Refresh to load.`}`}
      >
        <table className="data-table">
          <thead>
            <tr>
              <SortTh label="User" sortKey="user" activeKey={key} dir={dir} onSort={onSort} />
              <th>Platforms</th>
              <SortTh label="Status" sortKey="status" activeKey={key} dir={dir} onSort={onSort} />
              <SortTh label="Boards" sortKey="stations" activeKey={key} dir={dir} onSort={onSort} />
              <SortTh label="Last seen" sortKey="lastSeen" activeKey={key} dir={dir} onSort={onSort} className="nowrap" />
              <SortTh label="Joined" sortKey="joined" activeKey={key} dir={dir} onSort={onSort} className="nowrap" />
            </tr>
          </thead>
          <tbody>
            {slice.map((u) => (
              <tr key={u.uid} className="row-click" onClick={() => setOpenUid(u.uid)} title="View full details">
                <td>
                  <div className="cell-title">{u.displayName || '(no name)'}</div>
                  <div className="cell-sub">{u.email || u.uid}</div>
                </td>
                <td className="nowrap">
                  <PlatformBadges platforms={u.platforms} />
                  {u.versions && Object.keys(u.versions).length > 0 && (
                    <div className="cell-sub">{Object.entries(u.versions).map(([p, v]) => `${p === 'ios' ? 'iOS' : p === 'android' ? 'A' : p} ${v}`).join(' · ')}</div>
                  )}
                </td>
                <td className="nowrap">
                  <span className={`pill ${u.loggedIn ? 'on' : 'off'}`}>{u.loggedIn ? 'Signed in' : 'Signed out'}</span>
                  {u.emailVerified ? <span className="pill verified">Verified</span> : <span className="pill muted">Unverified</span>}
                  {(u.support?.count ?? 0) > 0 && (
                    <span className="pill on" title={`${u.support!.count} payments, ${money(u.support!.totalMinor)}`}>♥ {money(u.support!.totalMinor)}</span>
                  )}
                </td>
                <td>{u.stationCount}</td>
                <td className="muted nowrap" title="Latest of device last seen and last login">
                  {relTime(Math.max(toMs(u.lastSeen ?? 0), toMs(u.lastLoggedInTime)))}
                </td>
                <td className="muted nowrap">{dateTime(toMs(u.createdAt))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataCard>

      <Pager page={page} pageCount={pageCount} setPage={setPage} />

      {openUid && <UserDetailModal uid={openUid} onClose={() => setOpenUid(null)} />}
    </div>
  );
}
