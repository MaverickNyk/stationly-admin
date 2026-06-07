'use client';

/**
 * Compact pager shown under a data table. Renders nothing when everything fits
 * on one page, so small lists are unaffected.
 */
export default function Pager({
  page,
  pageCount,
  setPage,
}: {
  page: number;
  pageCount: number;
  setPage: (p: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="pager">
      <button onClick={() => setPage(page - 1)} disabled={page <= 1}>
        ← Prev
      </button>
      <span className="pager-meta">
        Page {page} of {pageCount}
      </span>
      <button onClick={() => setPage(page + 1)} disabled={page >= pageCount}>
        Next →
      </button>
    </div>
  );
}
