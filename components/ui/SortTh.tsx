'use client';

import type { SortDir } from '@/lib/useSort';

/**
 * A sortable table header cell. Shows a direction caret when it's the active
 * sort column; clicking calls `onSort(sortKey)` (the useSort hook toggles
 * direction / switches column).
 */
export default function SortTh({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  className,
}: {
  label: React.ReactNode;
  sortKey: string;
  activeKey: string;
  dir: SortDir;
  onSort: (key: string) => void;
  className?: string;
}) {
  const active = activeKey === sortKey;
  return (
    <th
      className={`sortable${active ? ' sorted' : ''}${className ? ' ' + className : ''}`}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" onClick={() => onSort(sortKey)}>
        {label}
        <span className="sort-caret">{active ? (dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );
}
