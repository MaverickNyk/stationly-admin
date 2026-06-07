'use client';

import { useId, useMemo, useState } from 'react';
import { dateTime } from '@/lib/format';

const HOUR = 3_600_000;
const DAY = 86_400_000;

type PresetKey = '1d' | '1w' | '1m' | '3m' | 'all' | 'custom';
const PRESETS: { key: PresetKey; label: string }[] = [
  { key: '1d', label: '1D' },
  { key: '1w', label: '1W' },
  { key: '1m', label: '1M' },
  { key: '3m', label: '3M' },
  { key: 'all', label: 'All' },
  { key: 'custom', label: 'Custom' },
];

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Pick a sensible bucket width so a window yields a readable number of points. */
function bucketFor(span: number): number {
  if (span <= 2 * DAY) return HOUR;
  if (span <= 120 * DAY) return DAY;
  return 7 * DAY;
}

/**
 * Cumulative growth over time, rendered as an inline SVG area+line (no chart
 * dependency). Feed it parsed epoch-ms timestamps (user.createdAt /
 * waitlist.joinedAt via `toMs`). The window is user-selectable: 1D / 1W / 1M /
 * 3M / All, or a custom date range; bucketing adapts to the span.
 */
export default function GrowthChart({
  times,
  defaultPreset = '1m',
}: {
  times: number[];
  defaultPreset?: PresetKey;
}) {
  const [preset, setPreset] = useState<PresetKey>(defaultPreset);
  const [from, setFrom] = useState(() => isoDate(Date.now() - 30 * DAY));
  const [to, setTo] = useState(() => isoDate(Date.now()));

  const sorted = useMemo(() => times.filter((t) => t > 0).sort((a, b) => a - b), [times]);

  const data = useMemo(() => {
    if (sorted.length === 0) return null;
    const now = Date.now();
    let start: number;
    let end = now;
    switch (preset) {
      case '1d': start = now - DAY; break;
      case '1w': start = now - 7 * DAY; break;
      case '1m': start = now - 30 * DAY; break;
      case '3m': start = now - 90 * DAY; break;
      case 'all': start = sorted[0]; break;
      case 'custom': {
        const f = Date.parse(from);
        const t = Date.parse(to);
        start = Number.isFinite(f) ? f : now - 30 * DAY;
        end = Number.isFinite(t) ? t + DAY - 1 : now; // inclusive end-of-day
        break;
      }
    }
    if (end <= start) return null;

    const bucket = bucketFor(end - start);
    const bounds: number[] = [];
    for (let t = start; t < end; t += bucket) bounds.push(t);
    bounds.push(end);

    // Cumulative total at each boundary (includes everything created before the
    // window, so the line reflects the true running total).
    const countLE = (t: number) => {
      // sorted ascending — linear is fine at these sizes.
      let n = 0;
      for (const x of sorted) {
        if (x <= t) n++;
        else break;
      }
      return n;
    };
    const days = bounds.map((t) => ({ t, total: countLE(t) }));
    return days;
  }, [sorted, preset, from, to]);

  return (
    <div className="growth">
      <div className="chart-controls">
        <div className="seg chart-presets">
          {PRESETS.map((p) => (
            <button key={p.key} className={preset === p.key ? 'active' : ''} onClick={() => setPreset(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="chart-range">
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            <span>→</span>
            <input type="date" value={to} min={from} max={isoDate(Date.now())} onChange={(e) => setTo(e.target.value)} />
          </div>
        )}
      </div>

      {!data || data.length < 2 ? (
        <p className="empty empty-pad">No dated records in this range.</p>
      ) : (
        <Plot data={data} />
      )}
    </div>
  );
}

function Plot({ data }: { data: { t: number; total: number }[] }) {
  const gid = `g${useId().replace(/[:]/g, '')}`;
  const W = 600;
  const H = 150;
  const padX = 6;
  const padTop = 14;
  const padBot = 12;
  const max = Math.max(1, ...data.map((d) => d.total));
  const min = Math.min(...data.map((d) => d.total));
  const range = Math.max(1, max - min);
  const xAt = (i: number) => padX + (i / (data.length - 1)) * (W - 2 * padX);
  const yAt = (v: number) => padTop + (1 - (v - min) / range) * (H - padTop - padBot);

  const line = data.map((d, i) => `${i ? 'L' : 'M'}${xAt(i).toFixed(1)} ${yAt(d.total).toFixed(1)}`).join(' ');
  const area = `${line} L ${xAt(data.length - 1).toFixed(1)} ${(H - padBot).toFixed(1)} L ${xAt(0).toFixed(1)} ${(H - padBot).toFixed(1)} Z`;
  const last = data[data.length - 1];
  const added = last.total - data[0].total;

  return (
    <>
      <div className="growth-head">
        <span className="growth-total">{last.total.toLocaleString()}</span>
        <span className="growth-delta">+{added} in range</span>
      </div>
      <svg className="growth-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cumulative growth chart">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--amber)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--amber)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gid})`} />
        <path
          d={line}
          fill="none"
          stroke="var(--amber)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={xAt(data.length - 1)} cy={yAt(last.total)} r="4" fill="var(--amber)" stroke="var(--bg)" strokeWidth="2" />
      </svg>
      <div className="growth-axis">
        <span>{dateTime(data[0].t)}</span>
        <span>{dateTime(last.t)}</span>
      </div>
    </>
  );
}
