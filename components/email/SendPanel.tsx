'use client';

import { useEffect, useState } from 'react';
import { fetchJson } from '@/lib/useResource';
import { useConfirmedFetch, StepUpCancelled } from '../StepUp';
import type { AudienceResult, Campaign, EmailMeta, SendMode } from '@/lib/emailTypes';

const when = (t?: number) => (t ? new Date(t).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '');

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  return (
    <div className="em-meter">
      <div className="em-meter-top"><span>{label}</span><b>{used} / {limit}</b></div>
      <div className="em-meter-bar"><div style={{ width: `${pct}%` }} className={pct > 85 ? 'hot' : ''} /></div>
    </div>
  );
}

export default function SendPanel({
  campaign, meta, audience, saving, onTest, onSent, onReload,
}: {
  campaign: Campaign;
  meta: EmailMeta | null;
  audience: AudienceResult | null;
  saving: boolean;
  onTest: (to: string[]) => Promise<{ sent: string[]; failed: Array<{ to: string; error: string }> }>;
  onSent: (c: Campaign) => void;
  onReload: () => Promise<void>;
}) {
  const plan = audience?.plan;
  const [mode, setMode] = useState<SendMode | null>(null);
  const [testTo, setTestTo] = useState('');
  const [testMsg, setTestMsg] = useState('');
  const [testBusy, setTestBusy] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirmFetch = useConfirmedFetch();
  const [deliveries, setDeliveries] = useState<Array<{ n: number; sent: Array<{ to: string; id: string }>; failed: Array<{ to: string; error: string }> }> | null>(null);

  useEffect(() => { setMode(plan?.recommended ?? null); }, [plan?.recommended]);

  // Poll while sending.
  useEffect(() => {
    if (campaign.status !== 'sending') return;
    const t = setInterval(() => { void onReload(); }, 2500);
    return () => clearInterval(t);
  }, [campaign.status, onReload]);

  const usage = plan?.usage ?? meta?.usage;
  const count = audience?.count ?? 0;
  const chosen = mode && plan ? plan[mode] : null;
  const canSend = campaign.status === 'draft' && !!chosen?.allowed && confirm.trim() === String(count) && count > 0 && !saving && !busy;

  const test = async () => {
    setTestBusy(true); setTestMsg('');
    try {
      const r = await onTest(testTo.split(/[\s,;]+/).filter(Boolean));
      setTestMsg(`Sent to ${r.sent.join(', ') || 'nobody'}${r.failed.length ? `. Failed: ${r.failed.map((f) => `${f.to} (${f.error})`).join(', ')}` : ''}.`);
    } catch (e: any) { setTestMsg(e instanceof StepUpCancelled ? 'Not sent: the password check was cancelled.' : e.message); }
    finally { setTestBusy(false); }
  };

  const send = async () => {
    if (!mode) return;
    setBusy(true); setError('');
    try {
      const c = await confirmFetch<Campaign>(`Send “${campaign.doc.subject}” to ${count} ${count === 1 ? 'person' : 'people'} as a ${mode === 'direct' ? 'direct send' : 'broadcast'}${meta?.env === 'production' ? ' on PRODUCTION' : ''}`, `/api/admin/email/campaigns/${campaign.id}/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, confirmCount: count }),
      });
      setConfirm('');
      onSent(c);
    } catch (e: any) { setError(e instanceof StepUpCancelled ? 'Not sent: the password check was cancelled.' : e.message); }
    finally { setBusy(false); }
  };

  const loadDeliveries = async () => {
    try { setDeliveries((await fetchJson<{ items: any[] }>(`/api/admin/email/campaigns/${campaign.id}/deliveries`)).items); }
    catch (e: any) { setError(e.message); }
  };

  const refreshBroadcast = async () => {
    try { onSent(await fetchJson<Campaign>(`/api/admin/email/campaigns/${campaign.id}/refresh`, { method: 'POST' })); }
    catch (e: any) { setError(e.message); }
  };

  return (
    <div className="em-send">
      <div className="card">
        <h2>Resend allowance</h2>
        {usage && (<>
          <Meter label="Sent today (transactional)" used={usage.usedToday} limit={usage.dailyLimit} />
          <Meter label="Sent this month" used={usage.usedThisMonth} limit={usage.monthlyLimit} />
          <div className="hint" style={{ marginTop: 8 }}>Resets {new Date(usage.resetsAt).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })} (midnight UTC). {usage.note}</div>
        </>)}
        {meta && (
          <div className="em-facts">
            <span>Broadcasts: free and unlimited, up to {meta.limits.marketingContacts.toLocaleString()} contacts</span>
            <span>Segment: “{meta.resend.managedSegmentName}”{meta.resend.segmentId ? '' : ' (made on first broadcast)'}</span>
            <span>{meta.counts.optouts} unsubscribed from news</span>
            {!meta.resend.configured && <span className="em-bad">RESEND_API_KEY is not set on this server</span>}
            {meta.staging && <span className="em-warn-inline">Staging: {meta.staging.allowlist ? `only ${meta.staging.allowlist} allowlisted address(es) can receive real sends` : 'no EMAIL_STAGING_ALLOWLIST set, so real sends reach anyone matched'}</span>}
          </div>
        )}
      </div>

      {campaign.status === 'draft' && (<>
        <div className="card">
          <h2>Send a test</h2>
          <p className="muted-2" style={{ fontSize: 13, marginTop: -4 }}>Marked “[Test]”, personalised as the person picked in the preview. Counts against today’s allowance.</p>
          <div className="em-inline">
            <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com (up to 5)" style={{ flex: 1 }} />
            <button type="button" className="btn-ghost" onClick={test} disabled={testBusy || !testTo.trim() || saving}>{testBusy ? 'Sending…' : 'Send test'}</button>
          </div>
          {testMsg && <div className="hint" style={{ marginTop: 8 }}>{testMsg}</div>}
          {campaign.tests && campaign.tests.length > 0 && (
            <div className="hint" style={{ marginTop: 8 }}>Earlier tests: {campaign.tests.slice(-3).map((t) => `${when(t.at)} → ${t.to.join(', ')}`).join(' · ')}</div>
          )}
        </div>

        <div className="card">
          <h2>How to send</h2>
          {!plan && <p className="muted-2">Building the audience…</p>}
          {plan && (
            <div className="em-modes">
              {(['direct', 'broadcast'] as SendMode[]).map((m) => {
                const o = plan[m];
                return (
                  <button type="button" key={m} className={`em-mode ${mode === m ? 'on' : ''} ${o.allowed ? '' : 'off'}`} onClick={() => o.allowed && setMode(m)} disabled={!o.allowed}>
                    <div className="em-mode-top">
                      <b>{m === 'direct' ? 'Direct (personal)' : 'Broadcast'}</b>
                      {plan.recommended === m && <span className="pill on">Recommended</span>}
                    </div>
                    <div className="em-mode-what">{m === 'direct'
                      ? `Resend batch API, 100 per request, rendered per person.`
                      : `Resend Broadcasts to the managed segment. Resend handles unsubscribes.`}</div>
                    <div className={o.allowed ? 'em-ok' : 'em-bad'}>{o.reason}</div>
                  </button>
                );
              })}
            </div>
          )}
          <div className="em-confirm">
            <label>Type <b>{count}</b> to confirm the number of people</label>
            <div className="em-inline">
              <input value={confirm} onChange={(e) => setConfirm(e.target.value)} inputMode="numeric" placeholder={String(count)} style={{ width: 120 }} />
              <button type="button" className="btn-send" disabled={!canSend} onClick={send}>
                {busy ? 'Starting…' : `Send to ${count} ${count === 1 ? 'person' : 'people'}`}
              </button>
            </div>
            <div className="hint">The server checks the audience again and refuses if the number has changed. {meta?.env === 'production' ? 'This is PRODUCTION.' : ''}</div>
          </div>
          {error && <div className="em-error">{error}</div>}
        </div>
      </>)}

      {campaign.status !== 'draft' && (
        <div className="card">
          <h2>{campaign.status === 'sending' ? 'Sending…' : 'Sent'}</h2>
          {campaign.progress && (
            <div className="em-progress">
              <div className="em-meter-top"><span>{campaign.progress.phase}</span><b>{campaign.progress.done} / {campaign.progress.total}</b></div>
              <div className="em-meter-bar"><div style={{ width: `${Math.round((campaign.progress.done / Math.max(1, campaign.progress.total)) * 100)}%` }} /></div>
            </div>
          )}
          {campaign.result && (
            <div className="em-result">
              <div><span className="muted-2">Status</span><b className={`em-status ${campaign.status}`}>{campaign.status}</b></div>
              <div><span className="muted-2">How</span><b>{campaign.mode}</b></div>
              <div><span className="muted-2">Sent</span><b>{campaign.result.sent} of {campaign.result.total}</b></div>
              {campaign.result.failed > 0 && <div><span className="muted-2">Failed</span><b className="em-bad">{campaign.result.failed}</b></div>}
              {campaign.sentAt && <div><span className="muted-2">At</span><b>{when(campaign.sentAt)}</b></div>}
              {campaign.result.broadcastId && (<>
                <div><span className="muted-2">Broadcast</span><b>{campaign.result.broadcastStatus || '…'}</b></div>
                <div className="em-inline">
                  <button type="button" className="btn-ghost" onClick={refreshBroadcast}>Refresh status</button>
                  <a className="btn-ghost" href={`https://resend.com/broadcasts/${campaign.result.broadcastId}`} target="_blank" rel="noreferrer">Open in Resend</a>
                </div>
              </>)}
              {campaign.result.segmentSync && <div className="hint">Segment: +{campaign.result.segmentSync.added} added ({campaign.result.segmentSync.created} new contacts), −{campaign.result.segmentSync.removed} removed</div>}
              {(campaign.result.errors || []).length > 0 && (
                <ul className="em-errors">{campaign.result.errors!.map((e, i) => <li key={i}>{e.to ? `${e.to}: ` : ''}{e.error}</li>)}</ul>
              )}
            </div>
          )}
          {campaign.status !== 'sending' && (
            <div style={{ marginTop: 12 }}>
              <button type="button" className="btn-ghost" onClick={loadDeliveries}>Who received it</button>
              {deliveries && (
                <table className="data-table" style={{ marginTop: 10 }}>
                  <thead><tr><th>Email</th><th>Result</th></tr></thead>
                  <tbody>
                    {deliveries.flatMap((d) => [
                      ...d.sent.map((s) => <tr key={`s${d.n}${s.to}`}><td className="em-mono">{s.to}</td><td className="em-ok">accepted</td></tr>),
                      ...d.failed.map((f) => <tr key={`f${d.n}${f.to}`}><td className="em-mono">{f.to}</td><td className="em-bad">{f.error}</td></tr>),
                    ])}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
