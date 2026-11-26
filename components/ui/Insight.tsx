/**
 * Small pieces shared by the analytics, support and users views: a number
 * tile, a horizontal bar list, platform badges and money formatting.
 */
export const PLATFORM_LABEL: Record<string, string> = { android: 'Android', ios: 'iOS', web: 'Web', unknown: 'Unknown' };

export function money(minor: number | undefined | null): string {
  const v = (minor ?? 0) / 100;
  return `£${v.toLocaleString('en-GB', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

export function pct(part: number, whole: number): string {
  if (!whole) return '–';
  return `${Math.round((part / whole) * 100)}%`;
}

export function Tile({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string }) {
  return (
    <div className={`stat-card${tone ? ` tone-${tone}` : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub != null && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function PlatformBadges({ platforms }: { platforms?: string[] }) {
  if (!platforms?.length) return <span className="muted-2">none</span>;
  return (
    <>
      {platforms.map((p) => (
        <span key={p} className={`pf pf-${p}`}>{PLATFORM_LABEL[p] ?? p}</span>
      ))}
    </>
  );
}

/** Rows of label · bar · value, bars scaled to the largest value. */
export function BarList({
  rows,
  format = (n: number) => n.toLocaleString('en-GB'),
  empty = 'Nothing yet.',
}: {
  rows: Array<{ label: React.ReactNode; value: number; tone?: string; note?: React.ReactNode }>;
  format?: (n: number) => string;
  empty?: string;
}) {
  if (!rows.length) return <p className="empty">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="barlist">
      {rows.map((r, i) => (
        <div className="barlist-row" key={i}>
          <span className="barlist-label">{r.label}</span>
          <span className="barlist-track">
            <span className={`barlist-fill${r.tone ? ` pf-bg-${r.tone}` : ''}`} style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="barlist-value">
            {format(r.value)}
            {r.note != null && <span className="muted-2"> {r.note}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
