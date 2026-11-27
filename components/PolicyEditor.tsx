'use client';

import { useMemo, useState } from 'react';
import Toolbar from './ui/Toolbar';
import ErrorBanner from './ui/ErrorBanner';
import { useResource } from '@/lib/useResource';
import { useConfirmedFetch, StepUpCancelled } from './StepUp';

type Spec = { kind: 'bool' | 'int' | 'enum' | 'string' | string; min?: number; max?: number; values?: string[] };
type Key = { key: string; value: string; source: 'live' | 'env' | 'default'; default?: string; env?: string; spec?: Spec; about?: string };

function specText(s?: Spec): string {
  if (!s) return '';
  if (s.kind === 'bool') return 'on or off';
  if (s.kind === 'enum') return `one of: ${(s.values ?? []).join(', ')}`;
  if (s.kind === 'int') return `whole number${s.min != null ? ` from ${s.min}` : ''}${s.max != null ? ` to ${s.max}` : ''}`;
  return s.kind;
}

function ValueInput({ k, value, onChange }: { k: Key; value: string; onChange: (v: string) => void }) {
  const s = k.spec;
  if (s?.kind === 'bool') {
    return (
      <select className="ctl" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="true">on (true)</option>
        <option value="false">off (false)</option>
      </select>
    );
  }
  if (s?.kind === 'enum' && s.values?.length) {
    return (
      <select className="ctl" value={value} onChange={(e) => onChange(e.target.value)}>
        {s.values.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
    );
  }
  return (
    <input
      type="text"
      inputMode={s?.kind === 'int' ? 'numeric' : undefined}
      value={value}
      placeholder={k.default != null ? `default ${k.default}` : ''}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

const shown = (k: Key, v: string) => (k.spec?.kind === 'bool' ? (v === 'true' ? 'on' : 'off') : v);

/**
 * The served notification policy (`notify.*`). Edits are validated by the
 * backend, all or nothing, with a reason. Emergency stop: set
 * notify.line.enabled or notify.remote.enabled to false and tell phones now.
 */
export default function PolicyEditor() {
  const { data, busy, error, reload } = useResource<{ keys: Key[] }>('/api/admin/x/notifications/policy');
  const [draft, setDraft] = useState<Record<string, string | null>>({});
  const [q, setQ] = useState('');
  const [reason, setReason] = useState('');
  const [push, setPush] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const keys = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.keys ?? []).filter((k) => !s || k.key.toLowerCase().includes(s) || (k.about ?? '').toLowerCase().includes(s));
  }, [data, q]);
  const dirty = Object.keys(draft).length > 0;

  const confirmFetch = useConfirmedFetch();
  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const r = await confirmFetch<{ ok: boolean; pushed: string | null }>(`Change ${Object.keys(draft).length} notification policy key(s)${push ? ' and tell phones to refetch' : ''}`, '/api/admin/x/notifications/policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ set: draft, reason: reason.trim(), by: 'admin console', push }),
      });
      setDraft({});
      setReason('');
      setMsg({ ok: true, text: push ? (r.pushed ? 'Saved. Phones were told to refetch.' : 'Saved, but the refresh push failed.') : 'Saved.' });
      await reload();
    } catch (e: any) {
      setMsg({ ok: false, text: e instanceof StepUpCancelled ? 'Not saved: the password check was cancelled.' : e?.message ?? 'Save failed' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Toolbar search={{ value: q, onChange: setQ, placeholder: 'Search keys…' }} meta={data ? `${data.keys.length} keys` : undefined}>
        <button onClick={() => reload()} disabled={busy}>{busy ? '…' : '↻ Reload'}</button>
      </Toolbar>
      <ErrorBanner message={error} onRetry={() => reload()} busy={busy} />

      <div className="card table-card">
        <table className="data-table">
          <thead><tr><th>Key</th><th>Value</th><th>From</th><th /></tr></thead>
          <tbody>
            {keys.map((k) => {
              const editing = k.key in draft;
              return (
                <tr key={k.key}>
                  <td>
                    <div className="mono" style={{ color: 'var(--text)' }}>{k.key}</div>
                    {k.about && <div className="muted" style={{ fontSize: 12, marginTop: 3, maxWidth: 520 }}>{k.about}</div>}
                    {k.spec && <div className="muted-2" style={{ fontSize: 11, marginTop: 2 }}>{specText(k.spec)}</div>}
                  </td>
                  <td className="wide" style={{ minWidth: 160 }}>
                    {editing ? (
                      <ValueInput k={k} value={draft[k.key] ?? ''} onChange={(v) => setDraft((d) => ({ ...d, [k.key]: v }))} />
                    ) : (
                      <span className={k.spec?.kind === 'bool' ? (k.value === 'true' ? 'ok-text' : 'warn-text') : 'mono'}>{shown(k, k.value)}</span>
                    )}
                  </td>
                  <td>
                    <span className={`pill ${k.source === 'live' ? 'on' : 'muted'}`}>{k.source}</span>
                    {k.default !== undefined && k.value !== k.default && <div className="muted-2" style={{ fontSize: 11 }}>default {shown(k, k.default)}</div>}
                  </td>
                  <td className="nowrap">
                    {editing ? (
                      <button className="btn-ghost" onClick={() => setDraft((d) => { const n = { ...d }; delete n[k.key]; return n; })}>Cancel</button>
                    ) : (
                      <>
                        <button className="btn-ghost" onClick={() => setDraft((d) => ({ ...d, [k.key]: k.value }))}>Edit</button>
                        {k.source === 'live' && (
                          <button className="btn-ghost" title="Remove the live value, back to env or default" onClick={() => setDraft((d) => ({ ...d, [k.key]: null }))}>Reset</button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>{dirty ? `${Object.keys(draft).length} change${Object.keys(draft).length === 1 ? '' : 's'}` : 'No changes'}</h2>
        {dirty && (
          <ul className="mono" style={{ fontSize: 12, margin: '0 0 6px', paddingLeft: 18 }}>
            {Object.entries(draft).map(([k, v]) => <li key={k}>{k} → {v === null ? '(back to default)' : v}</li>)}
          </ul>
        )}
        <div className="form-row">
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required, kept in the history)" />
          <label style={{ fontSize: 13 }}>
            <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} /> Tell phones now
          </label>
          <button className="btn-send" disabled={!dirty || !reason.trim() || saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
        {msg && <p className={msg.ok ? 'ok-text' : 'warn-text'} style={{ fontSize: 13, marginTop: 10 }}>{msg.text}</p>}
        <p className="note">Emergency stop: set notify.line.enabled or notify.remote.enabled to false and tell phones now. These reach Android only.</p>
      </div>
    </div>
  );
}
