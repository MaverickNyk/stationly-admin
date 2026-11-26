'use client';

import { useState } from 'react';
import Toolbar from './ui/Toolbar';
import ErrorBanner from './ui/ErrorBanner';
import { PLATFORM_LABEL } from './ui/Insight';
import { fetchJson, useResource } from '@/lib/useResource';

type Flag = { key: string; about: string; env: string; targets: Record<string, { on: boolean; source: 'live' | 'env' | 'default' }> };

/**
 * Feature flags, switched live. A change needs a reason (the audit trail) and
 * can push a config refresh so phones pick it up within minutes instead of on
 * their next home-config fetch.
 */
export default function FlagsEditor() {
  const { data, busy, error, reload } = useResource<{ flags: Flag[] }>('/api/admin/x/flags');
  const [draft, setDraft] = useState<Record<string, Record<string, boolean>>>({});
  const [reason, setReason] = useState('');
  const [push, setPush] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = Object.keys(draft).length > 0;
  const valueOf = (f: Flag, t: string) => draft[f.key]?.[t] ?? f.targets[t].on;

  function toggle(f: Flag, t: string) {
    setMsg(null);
    setDraft((d) => {
      const next = { ...d, [f.key]: { ...(d[f.key] ?? {}) } };
      const v = !valueOf(f, t);
      if (v === f.targets[t].on) delete next[f.key][t]; else next[f.key][t] = v;
      if (!Object.keys(next[f.key]).length) delete next[f.key];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetchJson<{ ok: boolean; pushed: string | null; errors?: string[] }>('/api/admin/x/flags', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ set: draft, reason: reason.trim(), by: 'admin console', push }),
      });
      setDraft({});
      setReason('');
      setMsg({ ok: true, text: push ? (r.pushed ? 'Saved. Phones were told to refetch.' : 'Saved, but the refresh push failed.') : 'Saved. Phones pick it up on their next config fetch.' });
      await reload();
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message ?? 'Save failed' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Toolbar><button onClick={() => reload()} disabled={busy}>{busy ? '…' : '↻ Reload'}</button></Toolbar>
      <ErrorBanner message={error} onRetry={() => reload()} busy={busy} />
      <div className="card">
        {(data?.flags ?? []).map((f) => (
          <div className="flag-row" key={f.key}>
            <div>
              <div className="mono" style={{ fontSize: 14, color: 'var(--text)' }}>{f.key}</div>
              <div className="note" style={{ marginTop: 4 }}>{f.about}</div>
              <div className="muted-2" style={{ fontSize: 11, marginTop: 4 }}>
                Env fallback <span className="mono">{f.env}</span>
              </div>
            </div>
            <div className="flag-targets">
              {Object.entries(f.targets).map(([t, s]) => {
                const on = valueOf(f, t);
                const changed = draft[f.key]?.[t] !== undefined;
                return (
                  <button key={t} className={`switch${on ? ' on' : ''}${changed ? ' dirty' : ''}`} onClick={() => toggle(f, t)} title={`Now: ${s.on ? 'on' : 'off'} (from ${s.source})`}>
                    {PLATFORM_LABEL[t] ?? t}: {on ? 'on' : 'off'}
                    <span className="muted-2">· {changed ? 'changed' : s.source}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {data && !data.flags.length && <p className="empty">No flags defined.</p>}

        <div className="form-row">
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required, kept in the history)" />
          <label style={{ fontSize: 13 }}>
            <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} /> Tell phones now
          </label>
          <button className="btn-send" disabled={!dirty || !reason.trim() || saving} onClick={save}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          {dirty && <button className="btn-ghost" onClick={() => setDraft({})}>Discard</button>}
        </div>
        {msg && <p className={msg.ok ? 'ok-text' : 'warn-text'} style={{ fontSize: 13, marginTop: 10 }}>{msg.text}</p>}
      </div>
      <p className="note">
        &quot;live&quot; is a value set here, &quot;env&quot; comes from the server&apos;s environment, &quot;default&quot; is the code&apos;s default.
        Changes apply to the environment shown in the sidebar.
      </p>
    </div>
  );
}
