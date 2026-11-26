'use client';

import { useEffect, useMemo, useState } from 'react';
import ErrorBanner from './ui/ErrorBanner';
import { PlatformBadges } from './ui/Insight';
import { fetchJson } from '@/lib/useResource';
import { describe, categoryOf, CATEGORY_LABEL, type Category } from '@/lib/activityText';

const NOISE = new Set(['app.backgrounded', 'notification.suppressed', 'widget.count']);
const PAGE = 150;

export type ActivityRow = { t: number; name: string; props: Record<string, unknown>; platform: string; appVersion: string; deviceId: string };

const time = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const day = (ms: number) => {
  const d = new Date(ms);
  const today = new Date();
  const y = new Date(Date.now() - 864e5);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

/** Loads one account's activity (from the backend's local copy, no Firestore reads). */
export function useActivity(uid: string, days: number) {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    setBusy(true);
    setErr('');
    fetchJson<{ events: ActivityRow[] }>(`/api/admin/x/users/${encodeURIComponent(uid)}/activity?days=${days}`)
      .then((r) => alive && setRows(r.events))
      .catch((e) => alive && setErr(e?.message ?? 'Failed'))
      .finally(() => alive && setBusy(false));
    return () => { alive = false; };
  }, [uid, days, nonce]);
  return { rows, busy, err, reload: () => setNonce((n) => n + 1) };
}

/**
 * The activity as sentences, grouped by day, newest first. `compact` is the
 * short version for the user dialog: no controls, a handful of rows.
 */
export default function ActivityTimeline({ uid, compact = false, limit }: { uid: string; compact?: boolean; limit?: number }) {
  const [days, setDays] = useState(compact ? 7 : 30);
  const { rows, busy, err, reload } = useActivity(uid, days);
  const [cat, setCat] = useState<Category | ''>('');
  const [q, setQ] = useState('');
  const [hideNoise, setHideNoise] = useState(true);
  const [raw, setRaw] = useState(false);
  // A busy account has thousands of rows; draw a page at a time so the
  // profile stays a sensible length (and fast) on a phone.
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [uid, days, cat, q, hideNoise]);

  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows ?? [])
      .map((r) => ({ ...r, cat: categoryOf(r.name), ...describe(r.name, r.props) }))
      // "Left the app" and held-back notifications are most of the volume and rarely the answer.
      .filter((r) => !(hideNoise || compact) || !NOISE.has(r.name))
      .filter((r) => !cat || r.cat === cat)
      .filter((r) => !s || r.text.toLowerCase().includes(s) || r.name.includes(s))
      .slice(0, limit ?? 2000);
  }, [rows, cat, q, hideNoise, compact, limit]);

  const counts = useMemo(() => {
    const c: Partial<Record<Category, number>> = {};
    for (const r of rows ?? []) { const k = categoryOf(r.name); c[k] = (c[k] ?? 0) + 1; }
    return c;
  }, [rows]);

  const groups = useMemo(() => {
    const out: Array<{ day: string; items: typeof items }> = [];
    for (const it of items.slice(0, compact ? items.length : shown)) {
      const d = day(it.t);
      if (out[out.length - 1]?.day !== d) out.push({ day: d, items: [] });
      out[out.length - 1].items.push(it);
    }
    return out;
  }, [items, compact, shown]);

  return (
    <div>
      {!compact && (
        <div className="act-controls">
          <div className="seg">
            {[7, 30, 90].map((d) => (
              <button key={d} className={days === d ? 'active' : ''} onClick={() => setDays(d)}>{d} days</button>
            ))}
          </div>
          <input className="search act-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search activity…" />
          <label className="act-check"><input type="checkbox" checked={hideNoise} onChange={(e) => setHideNoise(e.target.checked)} /> Hide routine</label>
          <label className="act-check"><input type="checkbox" checked={raw} onChange={(e) => setRaw(e.target.checked)} /> Show raw events</label>
          <button className="btn-ghost" onClick={reload} disabled={busy} aria-label="Reload activity">{busy ? '…' : '↻'}</button>
        </div>
      )}
      {!compact && rows && rows.length > 0 && (
        <div className="seg seg-scroll" style={{ margin: '10px 0 4px' }}>
          <button className={cat === '' ? 'active' : ''} onClick={() => setCat('')}>All <span className="muted-2">{rows.length}</span></button>
          {(Object.keys(CATEGORY_LABEL) as Category[]).filter((k) => counts[k]).map((k) => (
            <button key={k} className={cat === k ? 'active' : ''} onClick={() => setCat(k)}>
              {CATEGORY_LABEL[k]} <span className="muted-2">{counts[k]}</span>
            </button>
          ))}
        </div>
      )}
      <ErrorBanner message={err} onRetry={reload} busy={busy} />
      {busy && !rows && <p className="empty">Loading activity…</p>}
      {rows && !items.length && (
        <p className="empty">
          {rows.length ? 'Nothing matches.' : `Nothing uploaded in the last ${days} days. Apps upload overnight, and only while signed in.`}
        </p>
      )}
      <div className={compact ? 'act act-compact' : 'act'}>
        {groups.map((g) => (
          <div key={g.day} className="act-day">
            <div className="act-day-head">{g.day}</div>
            {g.items.map((r, i) => (
              <div key={i} className={`act-row tone-${r.tone}`}>
                <span className="act-time">{time(r.t)}</span>
                <span className="act-dot" />
                <span className="act-text">
                  {r.text}
                  {raw && <span className="act-raw"> {r.name} {Object.entries(r.props).map(([k, v]) => `${k}=${String(v)}`).join(' ')}</span>}
                </span>
                {!compact && <span className="act-pf"><PlatformBadges platforms={r.platform ? [r.platform] : []} /><span className="muted-2">{r.appVersion}</span></span>}
              </div>
            ))}
          </div>
        ))}
      </div>
      {!compact && items.length > shown && (
        <div className="act-more">
          <span className="muted-2">Showing {shown.toLocaleString('en-GB')} of {items.length.toLocaleString('en-GB')}</span>
          <button className="btn-ghost" onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, items.length - shown)} more</button>
        </div>
      )}
    </div>
  );
}
