'use client';

import { useMemo, useState } from 'react';
import type { AudienceFilter, AudienceResult, EmailMeta, Platform } from '@/lib/emailTypes';

const DAY = 86_400_000;
const ago = (t?: number) => {
  if (!t) return 'never';
  const d = Math.floor((Date.now() - t) / DAY);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d}d ago`;
};

export default function AudienceBuilder({
  value, onChange, meta, result, busy, error, readOnly,
}: {
  value: AudienceFilter;
  onChange: (a: AudienceFilter) => void;
  meta: EmailMeta | null;
  result: AudienceResult | null;
  busy: boolean;
  error: string;
  readOnly: boolean;
}) {
  const set = (p: Partial<AudienceFilter>) => onChange({ ...value, ...p });
  const togglePlatform = (p: Platform) => {
    const cur = value.platforms || [];
    set({ platforms: cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p] });
  };
  const [stationQuery, setStationQuery] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const stations = useMemo(() => meta?.options.stations ?? [], [meta]);
  const pickedStations = new Set(value.stations || []);
  const stationHits = useMemo(() => {
    const s = stationQuery.trim().toLowerCase();
    return (s ? stations.filter((x) => x.name.toLowerCase().includes(s) || x.id.toLowerCase().includes(s)) : stations).slice(0, 12);
  }, [stationQuery, stations]);
  const lineChoices = useMemo(() => {
    const set2 = new Set<string>();
    stations.filter((s) => pickedStations.has(s.id)).forEach((s) => s.lines.forEach((l) => set2.add(l)));
    return [...set2].sort();
  }, [stations, value.stations]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const all = result?.recipients ?? [];
    return s ? all.filter((r) => `${r.email} ${r.displayName || ''} ${(r.stations || []).join(' ')}`.toLowerCase().includes(s)) : all;
  }, [q, result]);
  const PER = 50;
  const pageRows = rows.slice(page * PER, page * PER + PER);

  return (
    <fieldset className="em-audience" disabled={readOnly}>
      <div className="card">
        <h2>Who gets it</h2>
        <div className="field">
          <label>Start from</label>
          <div className="seg">
            <button type="button" className={value.source === 'users' ? 'active' : ''} onClick={() => set({ source: 'users' })}>Stationly accounts{meta ? ` (${meta.counts.users})` : ''}</button>
            <button type="button" className={value.source === 'waitlist' ? 'active' : ''} onClick={() => set({ source: 'waitlist' })}>Waitlist{meta ? ` (${meta.counts.waitlist})` : ''}</button>
            <button type="button" className={value.source === 'none' ? 'active' : ''} onClick={() => set({ source: 'none' })}>Only the addresses I type</button>
          </div>
        </div>

        {value.source === 'users' && (<>
          <div className="em-filter-grid">
            <div className="field">
              <label>Platform</label>
              <div className="seg em-seg-sm">
                {(['android', 'ios', 'none'] as Platform[]).map((p) => (
                  <button type="button" key={p} className={(value.platforms || []).includes(p) ? 'active' : ''} onClick={() => togglePlatform(p)}>{p === 'ios' ? 'iPhone' : p === 'android' ? 'Android' : 'No device'}</button>
                ))}
              </div>
              <div className="hint">None picked = everyone.</div>
            </div>
            <div className="field">
              <label>App version</label>
              <div className="em-inline">
                <select value={value.appVersion?.platform || ''} onChange={(e) => set({ appVersion: e.target.value ? { platform: e.target.value as 'android' | 'ios', op: value.appVersion?.op || 'lt', value: value.appVersion?.value || '' } : undefined })}>
                  <option value="">Any</option><option value="android">Android</option><option value="ios">iPhone</option>
                </select>
                {value.appVersion && (<>
                  <select value={value.appVersion.op} onChange={(e) => set({ appVersion: { ...value.appVersion!, op: e.target.value as any } })}>
                    <option value="lt">older than</option><option value="lte">at most</option><option value="eq">exactly</option><option value="gte">at least</option><option value="gt">newer than</option>
                  </select>
                  <input list={`ver-${value.appVersion.platform}`} value={value.appVersion.value} onChange={(e) => set({ appVersion: { ...value.appVersion!, value: e.target.value } })} placeholder="2.0" style={{ width: 80 }} />
                  <datalist id={`ver-${value.appVersion.platform}`}>{(meta?.options.versions[value.appVersion.platform] || []).map((v) => <option key={v} value={v} />)}</datalist>
                </>)}
              </div>
              <div className="hint">From the newest device of that platform on the account.</div>
            </div>
            <div className="field">
              <label>Last active</label>
              <div className="em-inline">
                <select value={value.activeWithinDays ? `in:${value.activeWithinDays}` : value.inactiveForDays ? `out:${value.inactiveForDays}` : ''} onChange={(e) => {
                  const [k, n] = e.target.value.split(':');
                  set({ activeWithinDays: k === 'in' ? Number(n) : undefined, inactiveForDays: k === 'out' ? Number(n) : undefined });
                }}>
                  <option value="">Any time</option>
                  <option value="in:7">In the last 7 days</option><option value="in:30">In the last 30 days</option><option value="in:90">In the last 90 days</option>
                  <option value="out:30">Not for 30+ days</option><option value="out:90">Not for 90+ days</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label>Signed in</label>
              <div className="seg em-seg-sm">{(['any', 'yes', 'no'] as const).map((v) => <button type="button" key={v} className={(value.signedIn || 'any') === v ? 'active' : ''} onClick={() => set({ signedIn: v })}>{v === 'any' ? 'Any' : v === 'yes' ? 'Yes' : 'No'}</button>)}</div>
            </div>
            <div className="field">
              <label>Boards</label>
              <div className="seg em-seg-sm">{(['any', 'with', 'without'] as const).map((v) => <button type="button" key={v} className={(value.boards || 'any') === v ? 'active' : ''} onClick={() => set({ boards: v })}>{v === 'any' ? 'Any' : v === 'with' ? 'Has boards' : 'No boards'}</button>)}</div>
            </div>
            <div className="field">
              <label>Supporters</label>
              <div className="seg em-seg-sm">{(['any', 'yes', 'no'] as const).map((v) => <button type="button" key={v} className={(value.supporter || 'any') === v ? 'active' : ''} onClick={() => set({ supporter: v })}>{v === 'any' ? 'Any' : v === 'yes' ? 'Supporters' : 'Not yet'}</button>)}</div>
            </div>
            <div className="field">
              <label>Joined</label>
              <div className="em-inline">
                <input type="date" value={value.joinedAfter || ''} onChange={(e) => set({ joinedAfter: e.target.value || undefined })} />
                <span className="muted-2">to</span>
                <input type="date" value={value.joinedBefore || ''} onChange={(e) => set({ joinedBefore: e.target.value || undefined })} />
              </div>
            </div>
            <div className="field">
              <label>Sign-in</label>
              <div className="seg em-seg-sm">
                {(meta?.options.providers || []).map((p) => (
                  <button type="button" key={p} className={(value.providers || []).includes(p) ? 'active' : ''} onClick={() => {
                    const cur = value.providers || [];
                    set({ providers: cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p] });
                  }}>{p}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="field">
            <label>Tracks a station</label>
            <div className="em-chips">
              {(value.stations || []).map((id) => {
                const s = stations.find((x) => x.id === id);
                return <span className="chip" key={id}>{s?.name || id}<button type="button" onClick={() => set({ stations: (value.stations || []).filter((x) => x !== id) })}>×</button></span>;
              })}
            </div>
            <input value={stationQuery} onChange={(e) => setStationQuery(e.target.value)} placeholder="Search stations people track…" />
            {stationQuery && (
              <div className="em-station-hits">
                {stationHits.map((s) => (
                  <button type="button" key={s.id} onClick={() => { set({ stations: [...new Set([...(value.stations || []), s.id])] }); setStationQuery(''); }}>
                    <b>{s.name}</b><span>{s.lines.join(', ')} · {s.count} account{s.count === 1 ? '' : 's'} · {s.id}</span>
                  </button>
                ))}
                {stationHits.length === 0 && <span className="muted-2">No tracked station matches.</span>}
              </div>
            )}
            {(value.stations || []).length > 0 && (
              <div className="em-inline" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                <span className="muted-2">Only on line</span>
                {lineChoices.map((l) => (
                  <button type="button" key={l} className={`em-mini ${(value.lines || []).includes(l) ? 'on' : ''}`} onClick={() => {
                    const cur = value.lines || [];
                    set({ lines: cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l] });
                  }}>{l}</button>
                ))}
                <span className="muted-2" style={{ marginLeft: 12 }}>Direction</span>
                {['inbound', 'outbound'].map((d) => (
                  <button type="button" key={d} className={`em-mini ${(value.directions || []).includes(d) ? 'on' : ''}`} onClick={() => {
                    const cur = value.directions || [];
                    set({ directions: cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d] });
                  }}>{d}</button>
                ))}
              </div>
            )}
            <div className="hint">Use {'{{station}}'} in the email to name the station each person tracks (direct sends only).</div>
          </div>
        </>)}

        {value.source === 'waitlist' && (
          <div className="row em-row-wrap">
            <div className="field"><label>Joined after</label><input type="date" value={value.joinedAfter || ''} onChange={(e) => set({ joinedAfter: e.target.value || undefined })} /></div>
            <div className="field"><label>Joined before</label><input type="date" value={value.joinedBefore || ''} onChange={(e) => set({ joinedBefore: e.target.value || undefined })} /></div>
          </div>
        )}

        <div className="row em-row-wrap">
          <div className="field">
            <label>{value.source === 'none' ? 'Send to' : 'Also send to'}</label>
            <textarea rows={3} value={(value.customEmails || []).join('\n')} onChange={(e) => set({ customEmails: e.target.value.split(/\n/) })} placeholder="one@example.com, two@example.com" />
            <div className="hint">Comma, space or new line. A known account gets its own name.</div>
          </div>
          <div className="field">
            <label>Never send to</label>
            <textarea rows={3} value={(value.excludeEmails || []).join('\n')} onChange={(e) => set({ excludeEmails: e.target.value.split(/\n/) })} placeholder="me@example.com" />
            <label className="em-check-inline"><input type="checkbox" checked={!!value.excludeAppleRelay} onChange={(e) => set({ excludeAppleRelay: e.target.checked })} /> Skip Apple hidden addresses (…@privaterelay.appleid.com)</label>
          </div>
        </div>
      </div>

      <div className="card table-card em-recipients">
        <div className="em-rec-head">
          <div>
            <div className="em-big">{busy ? '…' : result?.count ?? 0}</div>
            <div className="muted-2">{result?.count === 1 ? 'person will get this' : 'people will get this'}{result?.truncated ? ' (list shows the first 1,000)' : ''}</div>
          </div>
          {result && result.excluded.length > 0 && (
            <div className="em-excluded">
              <b>Left out</b>
              {result.excluded.map((x) => <span key={x.reason}>{x.count} · {x.reason}</span>)}
            </div>
          )}
          <input className="em-search" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search the list…" />
        </div>
        {error && <div className="em-error" style={{ margin: 16 }}>{error}</div>}
        <table className="data-table">
          <thead><tr><th>Email</th><th>Name used</th><th>Platform</th><th>Station</th><th>Last active</th><th>From</th></tr></thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.email}>
                <td className="em-mono">{r.email}</td>
                <td>{r.firstName || <span className="muted-2">“there”</span>}</td>
                <td>{(r.platforms || []).map((p) => <span key={p} className="pill muted">{p}{r.versions?.[p] ? ` ${r.versions[p]}` : ''}</span>)}</td>
                <td>{(r.stations || []).join(', ')}</td>
                <td className="muted-2">{r.source === 'user' || r.lastSeen ? ago(r.lastSeen) : ''}</td>
                <td className="muted-2">{r.source}</td>
              </tr>
            ))}
            {!busy && pageRows.length === 0 && <tr><td colSpan={6} className="muted-2" style={{ padding: 20 }}>Nobody matches yet.</td></tr>}
          </tbody>
        </table>
        {rows.length > PER && (
          <div className="em-pager">
            <button type="button" className="btn-ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
            <span className="muted-2">{page * PER + 1}–{Math.min(rows.length, (page + 1) * PER)} of {rows.length}</span>
            <button type="button" className="btn-ghost" disabled={(page + 1) * PER >= rows.length} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        )}
      </div>
    </fieldset>
  );
}
