'use client';

import { useEffect } from 'react';

/**
 * On a phone, `table.data-table` is drawn as a stack of cards (see the
 * "Phone" section of globals.css), each cell on its own line under its column
 * name. CSS can't read a column header from inside a cell, so this copies each
 * header's text onto its cells as `data-label`. It watches the page because
 * tables re-render on every sort, page and filter change.
 */
export default function TableLabels() {
  useEffect(() => {
    let queued = false;
    const label = () => {
      queued = false;
      document.querySelectorAll<HTMLTableElement>('table.data-table').forEach((table) => {
        const heads = Array.from(table.querySelectorAll('thead th')).map((th) => (th.textContent ?? '').replace(/[▲▼↕]/g, '').trim());
        table.querySelectorAll('tbody tr').forEach((tr) => {
          Array.from(tr.children).forEach((td, i) => {
            const want = heads[i] ?? '';
            if (td.getAttribute('data-label') !== want) td.setAttribute('data-label', want);
          });
        });
      });
    };
    const queue = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(label);
    };
    label();
    const obs = new MutationObserver(queue);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);
  return null;
}
