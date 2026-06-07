'use client';

import { useEffect, useMemo, useState } from 'react';

/**
 * Client-side pagination. Resets to page 1 whenever the input list changes
 * (e.g. a new search filter) so you're never stranded on an empty page.
 */
export function usePaged<T>(items: T[], pageSize = 50) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [items]);

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pageCount);

  const slice = useMemo(
    () => items.slice((current - 1) * pageSize, current * pageSize),
    [items, current, pageSize],
  );

  return { slice, page: current, pageCount, setPage, pageSize };
}
