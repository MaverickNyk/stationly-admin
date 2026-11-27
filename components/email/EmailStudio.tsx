'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchJson } from '@/lib/useResource';
import { emailTemplates } from '@/lib/emailTemplates';
import type {
  AudienceFilter, AudienceResult, Campaign, CampaignSummary, EmailDoc, EmailMeta, RenderResult,
} from '@/lib/emailTypes';
import BlockEditor from './BlockEditor';
import EmailPreview from './EmailPreview';
import AudienceBuilder from './AudienceBuilder';
import SendPanel from './SendPanel';
import { useConfirmedFetch, StepUpCancelled } from '../StepUp';

type Tab = 'content' | 'audience' | 'send';
const JSONH = { 'Content-Type': 'application/json' };

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

const when = (t?: number) => (t ? new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

export default function EmailStudio() {
  const [meta, setMeta] = useState<EmailMeta | null>(null);
  const [list, setList] = useState<CampaignSummary[]>([]);
  const [listError, setListError] = useState('');
  const [current, setCurrent] = useState<Campaign | null>(null);
  const [doc, setDoc] = useState<EmailDoc | null>(null);
  const [audience, setAudience] = useState<AudienceFilter | null>(null);
  const [name, setName] = useState('');
  const [tab, setTab] = useState<Tab>('content');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [picking, setPicking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [render, setRender] = useState<RenderResult | null>(null);
  const [renderBusy, setRenderBusy] = useState(false);
  const [renderError, setRenderError] = useState('');
  const [aud, setAud] = useState<AudienceResult | null>(null);
  const [audBusy, setAudBusy] = useState(false);
  const [audError, setAudError] = useState('');
  const [sampleEmail, setSampleEmail] = useState('');
  const confirmFetch = useConfirmedFetch();

  const readOnly = !current || current.status !== 'draft';

  // ── load ───────────────────────────────────────────────────────────
  const loadList = useCallback(async () => {
    try { setList((await fetchJson<{ items: CampaignSummary[] }>('/api/admin/email/campaigns')).items); setListError(''); }
    catch (e: any) { setListError(e.message); }
  }, []);

  useEffect(() => {
    fetchJson<EmailMeta>('/api/admin/email/meta').then(setMeta).catch((e) => setListError(e.message));
    void loadList();
    const id = new URLSearchParams(window.location.search).get('id');
    if (id) void open(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const adopt = (c: Campaign) => {
    setCurrent(c); setDoc(c.doc); setAudience(c.audience); setName(c.name); setDirty(false); setSaveError('');
    window.history.replaceState(null, '', `?id=${c.id}`);
  };

  const open = async (id: string) => {
    try { adopt(await fetchJson<Campaign>(`/api/admin/email/campaigns/${id}`)); setTab('content'); setConfirmDelete(false); }
    catch (e: any) { setListError(e.message); }
  };

  const reload = useCallback(async () => {
    if (!current) return;
    const c = await fetchJson<Campaign>(`/api/admin/email/campaigns/${current.id}`).catch(() => null);
    if (c) { setCurrent(c); if (c.status !== 'sending') void loadList(); }
  }, [current, loadList]);

  // ── autosave (drafts) ──────────────────────────────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!current || readOnly || !dirty || !doc || !audience) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        const c = await fetchJson<Campaign>(`/api/admin/email/campaigns/${current.id}`, { method: 'PUT', headers: JSONH, body: JSON.stringify({ name, doc, audience }) });
        setCurrent((prev) => (prev ? { ...prev, updatedAt: c.updatedAt, name: c.name } : prev));
        setDirty(false); setSaveError('');
        setList((l) => l.map((x) => (x.id === c.id ? { ...x, name: c.name, subject: doc.subject, category: doc.category, updatedAt: c.updatedAt } : x)));
      } catch (e: any) { setSaveError(e.message); }
      finally { setSaving(false); }
    }, 900);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [doc, audience, name, dirty, current, readOnly]);

  // ── live preview + audience ────────────────────────────────────────
  const dDoc = useDebounced(doc, 350);
  const dAud = useDebounced(audience, 450);

  useEffect(() => {
    if (!dDoc) return;
    let cancelled = false;
    setRenderBusy(true);
    fetchJson<RenderResult>('/api/admin/email/render', { method: 'POST', headers: JSONH, body: JSON.stringify({ doc: dDoc, audience: dAud, sampleEmail }) })
      .then((r) => { if (!cancelled) { setRender(r); setRenderError(''); } })
      .catch((e) => { if (!cancelled) setRenderError(e.message); })
      .finally(() => { if (!cancelled) setRenderBusy(false); });
    return () => { cancelled = true; };
  }, [dDoc, dAud, sampleEmail]);

  useEffect(() => {
    if (!dAud) return;
    let cancelled = false;
    setAudBusy(true);
    fetchJson<AudienceResult>('/api/admin/email/audience', { method: 'POST', headers: JSONH, body: JSON.stringify({ audience: dAud, doc: dDoc }) })
      .then((r) => { if (!cancelled) { setAud(r); setAudError(''); } })
      .catch((e) => { if (!cancelled) setAudError(e.message); })
      .finally(() => { if (!cancelled) setAudBusy(false); });
    return () => { cancelled = true; };
  }, [dAud, dDoc?.category, dDoc?.blocks, dDoc?.subject]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── actions ────────────────────────────────────────────────────────
  const create = async (tplId: string) => {
    const t = emailTemplates().find((x) => x.id === tplId)!;
    try {
      const c = await fetchJson<Campaign>('/api/admin/email/campaigns', { method: 'POST', headers: JSONH, body: JSON.stringify({ name: t.id === 'blank' ? 'Untitled email' : t.name, doc: t.doc, audience: t.audience }) });
      setPicking(false); adopt(c); setTab('content'); void loadList();
    } catch (e: any) { setListError(e.message); }
  };
  const duplicate = async () => {
    if (!current) return;
    const c = await fetchJson<Campaign>(`/api/admin/email/campaigns/${current.id}/duplicate`, { method: 'POST' }).catch((e) => { setSaveError(e.message); return null; });
    if (c) { adopt(c); setTab('content'); void loadList(); }
  };
  const remove = async () => {
    if (!current) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    try {
      await confirmFetch(`Delete the draft “${current.name}”`, `/api/admin/email/campaigns/${current.id}`, { method: 'DELETE' });
      setCurrent(null); setDoc(null); setAudience(null); setRender(null); setAud(null);
      window.history.replaceState(null, '', '?'); void loadList();
    } catch (e: any) { if (!(e instanceof StepUpCancelled)) setSaveError(e.message); }
    setConfirmDelete(false);
  };
  const sendTest = async (to: string[]) => {
    if (!doc) throw new Error('Nothing to send.');
    const r = await confirmFetch<{ sent: string[]; failed: Array<{ to: string; error: string }> }>(`Send a test of “${doc.subject}” to ${to.join(', ')}`, '/api/admin/email/test', {
      method: 'POST', headers: JSONH, body: JSON.stringify({ doc, to, campaignId: current?.id, audience, sampleEmail }),
    });
    fetchJson<EmailMeta>('/api/admin/email/meta').then(setMeta).catch(() => undefined);
    return r;
  };

  const editDoc = (d: EmailDoc) => { setDoc(d); setDirty(true); };
  const editAudience = (a: AudienceFilter) => { setAudience(a); setDirty(true); };

  return (
    <div className="em-wide">
      <div className="em-layout">
        <aside className="em-rail">
          <button type="button" className="btn-send em-new" onClick={() => setPicking(true)}>New email</button>
          {listError && <div className="em-error">{listError}</div>}
          <div className="em-list">
            {list.map((c) => (
              <button type="button" key={c.id} className={`em-item ${current?.id === c.id ? 'on' : ''}`} onClick={() => open(c.id)}>
                <div className="em-item-top"><b>{c.name}</b><span className={`em-status ${c.status}`}>{c.status}</span></div>
                <div className="em-item-sub">{c.subject || 'No subject'}</div>
                <div className="em-item-meta">{c.category}{c.mode ? ` · ${c.mode}` : ''} · {when(c.sentAt || c.updatedAt)}{c.result ? ` · ${c.result.sent}/${c.result.total}` : ''}</div>
              </button>
            ))}
            {list.length === 0 && !listError && <p className="muted-2" style={{ fontSize: 13 }}>No emails yet.</p>}
          </div>
        </aside>

        <section className="em-main">
          {picking && (
            <div className="card em-templates">
              <div className="em-card-head"><h2>Start from</h2><button type="button" className="btn-ghost" onClick={() => setPicking(false)}>Cancel</button></div>
              <div className="em-tpl-grid">
                {emailTemplates().map((t) => (
                  <button type="button" key={t.id} onClick={() => create(t.id)}><b>{t.name}</b><span>{t.description}</span></button>
                ))}
              </div>
            </div>
          )}

          {!current && !picking && (
            <div className="card em-empty">
              <h2>Email studio</h2>
              <p className="muted-2">Write an email, pick exactly who gets it, check it the way an inbox shows it, send yourself a test, then send. Small personal sends go through Resend’s batch API; big announcements go as a Resend broadcast so they don’t use the daily allowance.</p>
              <button type="button" className="btn-send" onClick={() => setPicking(true)}>New email</button>
            </div>
          )}

          {current && doc && audience && (<>
            <div className="em-head">
              <input className="em-name" value={name} disabled={readOnly} onChange={(e) => { setName(e.target.value); setDirty(true); }} />
              <span className={`em-status ${current.status}`}>{current.status}</span>
              <span className="em-save">{readOnly ? '' : saving ? 'Saving…' : dirty ? 'Unsaved' : saveError ? '' : 'Saved'}</span>
              <div className="em-head-tools">
                {current.status === 'draft' && tab !== 'send' && (
                  <button type="button" className="btn-primary em-review" onClick={() => { setTab('send'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Review &amp; send →</button>
                )}
                <button type="button" className="btn-ghost" onClick={duplicate}>Duplicate</button>
                {current.status === 'draft' && <button type="button" className={`btn-ghost ${confirmDelete ? 'em-danger' : ''}`} onClick={remove} onBlur={() => setConfirmDelete(false)}>{confirmDelete ? 'Click again to delete' : 'Delete'}</button>}
              </div>
            </div>
            {saveError && <div className="em-error">{saveError}</div>}
            {readOnly && current.status !== 'sending' && <div className="em-note">This email has been sent and is kept as a record. Duplicate it to reuse it.</div>}

            <div className="em-tabs">
              {(['content', 'audience', 'send'] as Tab[]).map((t) => (
                <button type="button" key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
                  {t === 'content' ? 'Content' : t === 'audience' ? `Audience${aud ? ` · ${aud.count}` : ''}` : current.status === 'draft' ? 'Test & send' : 'Result'}
                </button>
              ))}
            </div>

            <div className={`em-split ${tab === 'audience' ? 'em-split-wide' : ''}`}>
              <div className="em-pane">
                {tab === 'content' && <BlockEditor doc={doc} onChange={editDoc} meta={meta} readOnly={readOnly} />}
                {tab === 'audience' && <AudienceBuilder value={audience} onChange={editAudience} meta={meta} result={aud} busy={audBusy} error={audError} readOnly={readOnly} />}
                {tab === 'send' && <SendPanel campaign={current} meta={meta} audience={aud} saving={saving || dirty} onTest={sendTest} onSent={(c) => { setCurrent(c); void loadList(); }} onReload={reload} />}
              </div>
              {tab !== 'audience' && (
                <div className="em-pane em-sticky">
                  <EmailPreview result={render} busy={renderBusy} error={renderError} recipients={aud?.recipients ?? []} sampleEmail={sampleEmail || render?.sample?.email || ''} onSample={setSampleEmail} />
                </div>
              )}
            </div>
          </>)}
        </section>
      </div>
    </div>
  );
}
