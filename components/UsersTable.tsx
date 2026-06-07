'use client';

import { useMemo, useState } from 'react';
import UserDetailModal from './UserDetailModal';
import Toolbar from './ui/Toolbar';
import DataCard from './ui/DataCard';
import SortTh from './ui/SortTh';
import Pager from './ui/Pager';
import ErrorBanner from './ui/ErrorBanner';
import GrowthChart from './ui/GrowthChart';
import { relTime, dateTime, toMs } from '@/lib/format';
import { useResource } from '@/lib/useResource';
import { useSort } from '@/lib/useSort';
import { usePaged } from '@/lib/usePaged';
import { downloadCsv } from '@/lib/csv';
import { ENV_META, type EnvName } from '@/lib/env';
import type { AdminUser } from '@/lib/backend';

type UsersPayload = { items: AdminUser[]; refreshedAt: number; cached: boolean };

export default function UsersTable({ env }: { env: EnvName }) {
  const { data, busy, error, reload } = useResource<UsersPayload>(
    '/api/admin/data?resource=users',
    '/api/admin/data?resource=users&refresh=1',
  );
  const [openUid, setOpenUid] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const items = useMemo(() => data?.items ?? [], [data]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (u) =>
        u.email.toLowerCase().includes(s) ||
        u.displayName.toLowerCase().includes(s) ||
        u.uid.toLowerCase().includes(s),
    );
  }, [items, q]);

  const { sorted, key, dir, onSort } = useSort<AdminUser>(filtered, {
    user: (u) => (u.displayName || u.email || u.uid).toLowerCase(),
    status: (u) => (u.loggedIn ? 1 : 0),
    stations: (u) => u.stationCount,
    lastSeen: (u) => toMs(u.lastLoggedInTime),
    joined: (u) => toMs(u.createdAt),
  });
  const { slice, page, pageCount, setPage } = usePaged(sorted, 50);

  function exportCsv() {
    downloadCsv(
      `users-${env}.csv`,
      ['email', 'displayName', 'uid', 'loggedIn', 'emailVerified', 'stationCount', 'lastLoggedIn', 'joined'],
      filtered.map((u) => [
        u.email,
        u.displayName,
        u.uid,
        u.loggedIn,
        u.emailVerified,
        u.stationCount,
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
        <button onClick={() => reload(true)} disabled={busy} title="Does one live Firestore read">
          {busy ? '…' : '↻ Refresh (1 read)'}
        </button>
      </Toolbar>

      <ErrorBanner message={error} onRetry={() => reload()} busy={busy} />

      <DataCard
        loading={busy && !items.length}
        isEmpty={!filtered.length}
        emptyText={`No users ${q ? 'match your search' : `cached for ${ENV_META[env].label}. Hit Refresh to load.`}`}
      >
        <table className="data-table">
          <thead>
            <tr>
              <SortTh label="User" sortKey="user" activeKey={key} dir={dir} onSort={onSort} />
              <SortTh label="Status" sortKey="status" activeKey={key} dir={dir} onSort={onSort} />
              <SortTh label="Stations" sortKey="stations" activeKey={key} dir={dir} onSort={onSort} />
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
                  <span className={`pill ${u.loggedIn ? 'on' : 'off'}`}>{u.loggedIn ? 'Active' : 'Offline'}</span>
                  {u.emailVerified ? <span className="pill verified">Verified</span> : <span className="pill muted">Unverified</span>}
                </td>
                <td>{u.stationCount}</td>
                <td className="muted nowrap">{relTime(toMs(u.lastLoggedInTime))}</td>
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
