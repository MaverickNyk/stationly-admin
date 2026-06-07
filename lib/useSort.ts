'use client';

import { useMemo, useState } from 'react';

export type SortDir = 'asc' | 'desc';
export type Accessor<T> = (item: T) => string | number | null | undefined;

/**
 * Client-side column sorting for the data tables. Callers supply a map of
 * column-key → value accessor; `onSort(key)` toggles direction (or switches
 * column), and `sorted` is the ordered list. Nullish values always sink to the
 * bottom regardless of direction.
 */
export function useSort<T>(
  items: T[],
  accessors: Record<string, Accessor<T>>,
  initial?: { key: string; dir: SortDir },
) {
  const [key, setKey] = useState(initial?.key ?? '');
  const [dir, setDir] = useState<SortDir>(initial?.dir ?? 'asc');

  const sorted = useMemo(() => {
    const acc = accessors[key];
    if (!acc) return items;
    const sign = dir === 'asc' ? 1 : -1;
    return [...items].sort((a, b) => {
      const va = acc(a);
      const vb = acc(b);
      // Push empty values to the end either way.
      const ea = va == null || va === '';
      const eb = vb == null || vb === '';
      if (ea && eb) return 0;
      if (ea) return 1;
      if (eb) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sign;
      return String(va).localeCompare(String(vb)) * sign;
    });
  }, [items, accessors, key, dir]);

  function onSort(nextKey: string) {
    if (nextKey === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setKey(nextKey);
      setDir('asc');
    }
  }

  return { sorted, key, dir, onSort };
}
