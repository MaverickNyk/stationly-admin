'use client';

import { useState } from 'react';
import type { Recipient, RenderResult } from '@/lib/emailTypes';

/**
 * What the recipient sees, rendered by the backend (the same renderer the real
 * send uses), framed like an inbox: the list row (sender, subject, preview
 * text), then the opened message at desktop or phone width.
 */
export default function EmailPreview({
  result, busy, error, recipients, sampleEmail, onSample,
}: {
  result: RenderResult | null;
  busy: boolean;
  error: string;
  recipients: Recipient[];
  sampleEmail: string;
  onSample: (email: string) => void;
}) {
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');
  const [view, setView] = useState<'html' | 'text'>('html');
  const sender = result?.from?.replace(/\s*<.*$/, '') || 'Stationly';
  const address = result?.from?.match(/<(.*)>/)?.[1] || '';
  const problems = result ? [...new Set([...result.problems.direct])] : [];

  return (
    <div className="em-preview">
      <div className="em-preview-bar">
        <div className="seg em-seg-sm">
          <button type="button" className={device === 'desktop' ? 'active' : ''} onClick={() => setDevice('desktop')}>Desktop</button>
          <button type="button" className={device === 'phone' ? 'active' : ''} onClick={() => setDevice('phone')}>Phone</button>
        </div>
        <div className="seg em-seg-sm">
          <button type="button" className={view === 'html' ? 'active' : ''} onClick={() => setView('html')}>Email</button>
          <button type="button" className={view === 'text' ? 'active' : ''} onClick={() => setView('text')}>Plain text</button>
        </div>
        <span className="em-preview-meta">{busy ? 'Rendering…' : result ? `${result.sizeKb} KB` : ''}</span>
      </div>

      <div className="em-sample">
        <label>Preview as</label>
        <select value={sampleEmail} onChange={(e) => onSample(e.target.value)} disabled={recipients.length === 0}>
          {recipients.length === 0 && <option value="">Sample values (no recipients yet)</option>}
          {recipients.slice(0, 300).map((r) => (
            <option key={r.email} value={r.email}>{r.firstName || '(no name)'} · {r.email}{r.stations?.length ? ` · ${r.stations.join(', ')}` : ''}</option>
          ))}
        </select>
      </div>

      {/* Inbox row */}
      <div className={`em-inbox em-${device}`}>
        <div className="em-inbox-row">
          <span className="em-avatar">S</span>
          <div className="em-inbox-text">
            <div className="em-inbox-top"><b>{sender}</b><span>now</span></div>
            <div className="em-inbox-subject">{result?.subject || 'No subject yet'}</div>
            <div className="em-inbox-pre">{result?.preheader || 'Add preview text so inboxes don’t show the first words of the body instead.'}</div>
          </div>
        </div>
        <div className="em-open-head">
          <div className="em-open-subject">{result?.subject || 'No subject yet'}</div>
          <div className="em-open-from"><b>{sender}</b> <span>&lt;{address}&gt;</span>{result?.sample && <span className="em-open-to"> to {result.sample.email}</span>}</div>
        </div>
        <div className={`em-frame em-${device}`}>
          {view === 'html'
            ? <iframe title="Email preview" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={result?.html || '<p style="font-family:sans-serif;color:#888;padding:24px">Nothing to show yet.</p>'} />
            : <pre className="em-text">{result?.text || ''}</pre>}
        </div>
      </div>

      {error && <div className="em-error">{error}</div>}
      {result?.warnings?.map((w) => <div key={w} className="em-warn">{w}</div>)}
      {problems.length > 0 && (
        <div className="em-problems">
          <b>Fix before sending</b>
          <ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
