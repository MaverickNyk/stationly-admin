'use client';

import { useMemo, useState } from 'react';
import Toolbar from './ui/Toolbar';
import DataCard from './ui/DataCard';
import SortTh from './ui/SortTh';
import Pager from './ui/Pager';
import ErrorBanner from './ui/ErrorBanner';
import { dateTime, relTime } from '@/lib/format';
import { useResource } from '@/lib/useResource';
import { useSort } from '@/lib/useSort';
import { usePaged } from '@/lib/usePaged';
import { ENV_META, type EnvName } from '@/lib/env';
import type { HistoryItem } from '@/lib/backend';

type HistoryPayload = { items: HistoryItem[] };

export default function HistoryTable({ env }: { env: EnvName }) {
  const { data, busy, error, reload } = useResource<HistoryPayload>('/api/admin/history?limit=100');
  const [q, setQ] = useState('');

  const items = useMemo(() => data?.items ?? [], [data]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (it) =>
        (it.title || '').toLowerCase().includes(s) ||
        (it.body || '').toLowerCase().includes(s) ||
        (it.audienceSummary || '').toLowerCase().includes(s),
    );
  }, [items, q]);

  const { sorted, key, dir, onSort } = useSort<HistoryItem>(
    filtered,
    {
      when: (it) => it.createdAt,
      result: (it) => it.successCount,
    },
    { key: 'when', dir: 'desc' },
  );
  const { slice, page, pageCount, setPage } = usePaged(sorted, 50);

  return (
    <div>
      <Toolbar
        search={{ value: q, onChange: setQ, placeholder: 'Search title, body or audience…' }}
        meta={`${filtered.length} of ${items.length} · local audit log (0 reads)`}
      >
        <button onClick={() => reload()} disabled={busy}>
          {busy ? '…' : '↻ Refresh'}
        </button>
      </Toolbar>

      <ErrorBanner message={error} onRetry={() => reload()} busy={busy} />

      <DataCard
        loading={busy && !items.length}
        isEmpty={!filtered.length}
        emptyText={q ? 'No sends match your search.' : `No sends recorded yet on ${ENV_META[env].label}.`}
      >
        <table className="data-table">
          <thead>
            <tr>
              <SortTh label="When" sortKey="when" activeKey={key} dir={dir} onSort={onSort} />
              <th>Audience</th>
              <th>Message</th>
              <th>Type</th>
              <SortTh label="Result" sortKey="result" activeKey={key} dir={dir} onSort={onSort} className="col-right" />
            </tr>
          </thead>
          <tbody>
            {slice.map((it) => (
              <tr key={it.id}>
                <td className="muted nowrap" title={dateTime(it.createdAt)}>{relTime(it.createdAt)}</td>
                <td className="nowrap">{it.audienceSummary}</td>
                <td>
                  <div className="cell-title">
                    {it.severity && <span className={`glyph ${it.severity}`}>●</span>}
                    {it.title}
                  </div>
                  <div className="cell-sub" style={{ fontFamily: 'inherit' }}>{it.body}</div>
                </td>
                <td className="muted nowrap">{it.payloadType}</td>
                <td className="col-right nowrap">
                  {it.ok ? (
                    <>
                      <span className="ok-n">{it.successCount}✓</span>{' '}
                      {it.failureCount > 0 && <span className="fail-n">{it.failureCount}✗</span>}
                    </>
                  ) : (
                    <span className="fail-n">failed</span>
                  )}
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
