'use client';

import { useMemo, useState } from 'react';
import Toolbar from './ui/Toolbar';
import DataCard from './ui/DataCard';
import SortTh from './ui/SortTh';
import Pager from './ui/Pager';
import ErrorBanner from './ui/ErrorBanner';
import { useResource } from '@/lib/useResource';
import { useSort } from '@/lib/useSort';
import { usePaged } from '@/lib/usePaged';
import { ENV_META, type EnvName } from '@/lib/env';
import type { SubscribedStation } from '@/lib/backend';

type StationsPayload = { items: SubscribedStation[] };

export default function StationsTable({ env }: { env: EnvName }) {
  const { data, busy, error, reload } = useResource<StationsPayload>('/api/admin/data?resource=subscribed');
  const [q, setQ] = useState('');

  const items = useMemo(() => data?.items ?? [], [data]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (st) => (st.commonName || '').toLowerCase().includes(s) || st.naptanId.toLowerCase().includes(s),
    );
  }, [items, q]);

  const { sorted, key, dir, onSort } = useSort<SubscribedStation>(
    filtered,
    {
      station: (st) => (st.commonName || st.naptanId).toLowerCase(),
      subscribers: (st) => st.count,
    },
    { key: 'subscribers', dir: 'desc' },
  );
  const { slice, page, pageCount, setPage } = usePaged(sorted, 50);

  const maxCount = useMemo(() => Math.max(1, ...items.map((i) => i.count)), [items]);

  return (
    <div>
      <Toolbar
        search={{ value: q, onChange: setQ, placeholder: 'Search station name or Naptan…' }}
        meta={`${filtered.length} of ${items.length} · served from memory (0 reads)`}
      >
        <button onClick={() => reload()} disabled={busy}>
          {busy ? '…' : '↻ Refresh'}
        </button>
      </Toolbar>

      <ErrorBanner message={error} onRetry={() => reload()} busy={busy} />

      <DataCard
        loading={busy && !items.length}
        isEmpty={!filtered.length}
        emptyText={`No subscribed stations ${q ? 'match your search' : `on ${ENV_META[env].label}.`}`}
      >
        <table className="data-table">
          <thead>
            <tr>
              <SortTh label="Station" sortKey="station" activeKey={key} dir={dir} onSort={onSort} />
              <th>Modes</th>
              <SortTh label="Subscribers" sortKey="subscribers" activeKey={key} dir={dir} onSort={onSort} className="col-subs" />
            </tr>
          </thead>
          <tbody>
            {slice.map((st) => (
              <tr key={st.naptanId}>
                <td>
                  <div className="cell-title">{st.commonName || '(unknown station)'}</div>
                  <div className="cell-sub">{st.naptanId}</div>
                </td>
                <td className="nowrap">
                  {st.modes.length ? st.modes.map((m) => <span key={m} className="pill muted">{m}</span>) : '—'}
                </td>
                <td>
                  <div className="bar-row">
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${Math.round((st.count / maxCount) * 100)}%` }} />
                    </div>
                    <b>{st.count}</b>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataCard>

      <Pager page={page} pageCount={pageCount} setPage={setPage} />
    </div>
  );
}
