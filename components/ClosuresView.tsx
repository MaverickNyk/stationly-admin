'use client';

import { useState } from 'react';
import Toolbar from './ui/Toolbar';
import ErrorBanner from './ui/ErrorBanner';
import { relTime, dateTime, num } from '@/lib/format';
import { useResource } from '@/lib/useResource';

type Notice = { id?: string; name?: string; mode?: string; kind?: string; text?: string; why?: string };
type Group = { at: number | null; stale: boolean; known: boolean; notices: Notice[]; said: Notice[] };
type Report = {
  days: number;
  states: Array<{ mode: string; kind: string; stations: number }>;
  unclear: Array<{ why: string | null; text: string; stations: number }>;
  recentRail: Array<{ at: number; event: string; kind: string; station: string; name: string; mode: string; text: string }>;
};

/** Station closures as the server holds them now, and what the log learned. */
export default function ClosuresView() {
  const now = useResource<Record<string, Group>>('/api/admin/x/station-status');
  const [days, setDays] = useState(7);
  const rep = useResource<Report>(`/api/admin/x/station-status/report?days=${days}`);

  return (
    <div>
      <Toolbar meta="Whether the apps show these is the stationStatus.show flag.">
        <button onClick={() => { now.reload(); rep.reload(); }} disabled={now.busy || rep.busy}>↻ Reload</button>
      </Toolbar>
      <ErrorBanner message={now.error} onRetry={() => now.reload()} busy={now.busy} />

      <div className="split" style={{ marginTop: 0 }}>
        {Object.entries(now.data ?? {}).map(([g, s]) => (
          <div className="card" key={g}>
            <h2 style={{ textTransform: 'capitalize' }}>{g}</h2>
            <p className="note" style={{ marginTop: 0 }}>
              {s.at ? <>From TfL {relTime(s.at)}</> : 'Nothing received yet'}
              {s.stale && <span className="warn-text"> · stale</span>}
              {' · '}{num(s.said.length)} stations affected
            </p>
            <ul className="timeline">
              {s.said.slice(0, 60).map((n, i) => (
                <li key={`${n.id}-${i}`} style={{ gridTemplateColumns: '1fr auto' }}>
                  <span>
                    <b style={{ color: 'var(--text)' }}>{n.name || n.id}</b>
                    {n.text && <div className="props">{n.text}</div>}
                  </span>
                  <span className={`pill ${n.kind === 'closed' ? 'off' : 'muted'}`}>{n.kind}</span>
                </li>
              ))}
              {!s.said.length && <li style={{ gridTemplateColumns: '1fr' }}><span className="muted">No closures.</span></li>}
            </ul>
          </div>
        ))}
      </div>

      <h2 className="section-title" style={{ marginTop: 28 }}>What the log saw</h2>
      <Toolbar>
        <div className="seg">
          {[1, 7, 30].map((d) => <button key={d} className={days === d ? 'active' : ''} onClick={() => setDays(d)}>{d === 1 ? '24 hours' : `${d} days`}</button>)}
        </div>
      </Toolbar>
      <ErrorBanner message={rep.error} onRetry={() => rep.reload()} busy={rep.busy} />
      {rep.data && (
        <div className="split" style={{ marginTop: 0 }}>
          <div className="card">
            <h2>Stations by kind</h2>
            <table className="mini">
              <thead><tr><th>Mode</th><th>Kind</th><th>Stations</th></tr></thead>
              <tbody>{rep.data.states.map((r, i) => <tr key={i}><td>{r.mode}</td><td>{r.kind}</td><td>{num(r.stations)}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="card">
            <h2>Notices we could not classify</h2>
            <ul className="timeline">
              {rep.data.unclear.slice(0, 40).map((r, i) => (
                <li key={i} style={{ gridTemplateColumns: 'auto 1fr' }}><b>{r.stations}</b><span className="props">{r.why ? `${r.why}: ` : ''}{r.text}</span></li>
              ))}
              {!rep.data.unclear.length && <li style={{ gridTemplateColumns: '1fr' }}><span className="muted">None.</span></li>}
            </ul>
          </div>
        </div>
      )}
      {rep.data && (
        <div className="card table-card" style={{ marginTop: 16 }}>
          <table className="data-table">
            <thead><tr><th>When</th><th>Station</th><th>Event</th><th>Kind</th><th>Said</th></tr></thead>
            <tbody>
              {rep.data.recentRail.map((r, i) => (
                <tr key={i}>
                  <td className="nowrap" title={dateTime(r.at)}>{relTime(r.at)}</td>
                  <td>{r.name}<div className="muted" style={{ fontSize: 11 }}>{r.mode}</div></td>
                  <td>{r.event}</td>
                  <td>{r.kind}</td>
                  <td className="muted" style={{ fontSize: 12, maxWidth: 420 }}>{r.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rep.data.recentRail.length && <p className="empty empty-pad">No rail changes in this window.</p>}
        </div>
      )}
    </div>
  );
}
