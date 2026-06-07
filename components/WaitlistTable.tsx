'use client';

import { useMemo, useState } from 'react';
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
import type { WaitlistEntry } from '@/lib/backend';

type WaitlistPayload = { items: WaitlistEntry[]; refreshedAt: number; cached: boolean };

export default function WaitlistTable({ env }: { env: EnvName }) {
  const { data, busy, error, reload } = useResource<WaitlistPayload>(
    '/api/admin/data?resource=waitlist',
    '/api/admin/data?resource=waitlist&refresh=1',
  );
  const [q, setQ] = useState('');

  const items = useMemo(() => data?.items ?? [], [data]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? items.filter((w) => w.email.toLowerCase().includes(s)) : items;
  }, [items, q]);

  const { sorted, key, dir, onSort } = useSort<WaitlistEntry>(
    filtered,
    {
      email: (w) => w.email.toLowerCase(),
      joined: (w) => toMs(w.joinedAt),
    },
    { key: 'joined', dir: 'desc' },
  );
  const { slice, page, pageCount, setPage } = usePaged(sorted, 50);

  function exportCsv() {
    downloadCsv(
      `waitlist-${env}.csv`,
      ['email', 'joinedAt'],
      filtered.map((w) => [w.email, new Date(w.joinedAt).toISOString()]),
    );
  }

  return (
    <div>
      {items.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h2>Waitlist growth</h2>
          <GrowthChart times={items.map((w) => toMs(w.joinedAt))} />
        </div>
      )}

      <Toolbar
        search={{ value: q, onChange: setQ, placeholder: 'Search email…' }}
        meta={
          <>
            {filtered.length} of {items.length} ·{' '}
            {data?.refreshedAt
              ? `${data.cached ? '⚡ cached, ' : ''}refreshed ${relTime(data.refreshedAt)}`
              : 'from local cache'}
          </>
        }
      >
        <button className="btn-ghost" onClick={exportCsv} disabled={!filtered.length}>
          Export CSV
        </button>
        <button onClick={() => reload(true)} disabled={busy} title="Does one live Firestore read">
          {busy ? '…' : '↻ Refresh (1 read)'}
        </button>
      </Toolbar>

      <ErrorBanner message={error} onRetry={() => reload()} busy={busy} />

      <DataCard
        loading={busy && !items.length}
        isEmpty={!filtered.length}
        emptyText={`No waitlist entries ${q ? 'match your search' : `cached for ${ENV_META[env].label}. Hit Refresh to load.`}`}
      >
        <table className="data-table">
          <thead>
            <tr>
              <SortTh label="Email" sortKey="email" activeKey={key} dir={dir} onSort={onSort} />
              <SortTh label="Joined" sortKey="joined" activeKey={key} dir={dir} onSort={onSort} className="nowrap" />
              <th className="nowrap">When</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((w) => (
              <tr key={w.id}>
                <td className="cell-title">{w.email}</td>
                <td className="muted nowrap">{dateTime(toMs(w.joinedAt))}</td>
                <td className="muted nowrap">{relTime(toMs(w.joinedAt))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataCard>

      <Pager page={page} pageCount={pageCount} setPage={setPage} />
    </div>
  );
}
