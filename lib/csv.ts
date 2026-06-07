type Cell = string | number | boolean | null | undefined;

/**
 * Build a CSV and trigger a client-side download. Replaces the two hand-rolled
 * exporters that lived in UsersTable/WaitlistTable. Every cell is quoted and
 * escaped so commas/quotes in the data can't break the columns.
 */
export function downloadCsv(filename: string, header: string[], rows: Cell[][]): void {
  const esc = (v: Cell) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [header.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
