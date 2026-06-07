'use client';

/**
 * The bordered, horizontally-scrollable card that wraps every data table, with
 * the three load states folded in: skeleton rows on first load, an empty-state
 * message, or the table itself. Previously each table re-implemented this
 * `card / overflowX / empty` markup inline.
 */
export default function DataCard({
  loading,
  isEmpty,
  emptyText,
  skeletonRows = 6,
  children,
}: {
  loading: boolean;
  isEmpty: boolean;
  emptyText: React.ReactNode;
  skeletonRows?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="card table-card">
      {loading ? (
        <TableSkeleton rows={skeletonRows} />
      ) : isEmpty ? (
        <p className="empty empty-pad">{emptyText}</p>
      ) : (
        children
      )}
    </div>
  );
}

function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div className="skeleton-table" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div className="skeleton-row" key={i}>
          <span className="skeleton-bar w-40" />
          <span className="skeleton-bar w-20" />
          <span className="skeleton-bar w-15" />
          <span className="skeleton-bar w-15" />
        </div>
      ))}
    </div>
  );
}
