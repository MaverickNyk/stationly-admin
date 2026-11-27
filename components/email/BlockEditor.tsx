'use client';

import { useRef, useState } from 'react';
import { fetchJson } from '@/lib/useResource';
import { BLOCK_PALETTE } from '@/lib/emailTemplates';
import { uid, type EmailAsset, type EmailBlock, type EmailDoc, type EmailMeta, type IconName } from '@/lib/emailTypes';

type Patch<T> = (p: Partial<T>) => void;

const LABEL: Record<EmailBlock['type'], string> = Object.fromEntries(BLOCK_PALETTE.map((p) => [p.type, p.label])) as any;

export default function BlockEditor({
  doc, onChange, meta, readOnly,
}: { doc: EmailDoc; onChange: (d: EmailDoc) => void; meta: EmailMeta | null; readOnly: boolean }) {
  const [adding, setAdding] = useState<number | null>(null);
  const [open, setOpen] = useState<string | null>(doc.blocks[0]?.id ?? null);
  const set: Patch<EmailDoc> = (p) => onChange({ ...doc, ...p });
  const setBlock = (i: number, p: Partial<EmailBlock>) => {
    const blocks = doc.blocks.slice();
    blocks[i] = { ...blocks[i], ...p } as EmailBlock;
    set({ blocks });
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= doc.blocks.length) return;
    const blocks = doc.blocks.slice();
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    set({ blocks });
  };
  const insert = (at: number, blk: EmailBlock) => {
    const blocks = doc.blocks.slice();
    blocks.splice(at, 0, blk);
    set({ blocks });
    setOpen(blk.id);
    setAdding(null);
  };

  return (
    <fieldset className="em-editor" disabled={readOnly}>
      <div className="card">
        <h2>Envelope</h2>
        <div className="field">
          <label>Subject</label>
          <input value={doc.subject} maxLength={150} onChange={(e) => set({ subject: e.target.value })} placeholder="What the inbox shows in bold" />
          <div className="hint">{doc.subject.length}/150 · keep it under about 60 so phones show it all</div>
        </div>
        <div className="field">
          <label>Preview text</label>
          <input value={doc.preheader || ''} maxLength={200} onChange={(e) => set({ preheader: e.target.value })} placeholder="The grey line after the subject in most inboxes" />
        </div>
        <div className="row em-row-wrap">
          <div className="field">
            <label>From name</label>
            <input value={doc.fromName} onChange={(e) => set({ fromName: e.target.value })} />
            <div className="hint">Sent from {meta?.fromAddress ?? 'info@stationly.co.uk'}</div>
          </div>
          <div className="field">
            <label>Reply-to (optional)</label>
            <input value={doc.replyTo || ''} onChange={(e) => set({ replyTo: e.target.value || undefined })} placeholder="info@stationly.co.uk" />
          </div>
        </div>
        <div className="field">
          <label>Kind of email</label>
          <div className="seg">
            <button type="button" className={doc.category === 'service' ? 'active' : ''} onClick={() => set({ category: 'service' })}>Service</button>
            <button type="button" className={doc.category === 'marketing' ? 'active' : ''} onClick={() => set({ category: 'marketing' })}>News / marketing</button>
          </div>
          <div className="hint">
            {doc.category === 'service'
              ? 'About something people use (an outage, a fix, their account). Goes to everyone, no unsubscribe link.'
              : 'Announcements and promotion. Carries an unsubscribe link, and skips anyone who unsubscribed.'}
          </div>
        </div>
        <div className="em-checks">
          <label><input type="checkbox" checked={doc.header.logo} onChange={(e) => set({ header: { ...doc.header, logo: e.target.checked } })} /> Stationly logo at the top</label>
          <label><input type="checkbox" checked={doc.header.accentBars} onChange={(e) => set({ header: { ...doc.header, accentBars: e.target.checked } })} /> Red bars top and bottom</label>
        </div>
      </div>

      <div className="card">
        <div className="em-card-head">
          <h2>Content</h2>
          {meta && (
            <span className="em-tokens">
              Personalise:
              {meta.mergeFields.map((m) => (
                <code key={m.token} title={`${m.label}. ${m.note}`} onClick={() => navigator.clipboard?.writeText(m.token).catch(() => undefined)}>{m.token}</code>
              ))}
            </span>
          )}
        </div>

        <Inserter open={adding === 0} onToggle={() => setAdding(adding === 0 ? null : 0)} onPick={(blk) => insert(0, blk)} />
        {doc.blocks.map((blk, i) => (
          <div key={blk.id}>
            <div className={`em-block ${open === blk.id ? 'open' : ''}`}>
              <div className="em-block-head" onClick={() => setOpen(open === blk.id ? null : blk.id)}>
                <span className="em-block-type">{LABEL[blk.type]}</span>
                <span className="em-block-sum">{summary(blk)}</span>
                <span className="em-block-tools" onClick={(e) => e.stopPropagation()}>
                  <button type="button" title="Move up" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                  <button type="button" title="Move down" onClick={() => move(i, 1)} disabled={i === doc.blocks.length - 1}>↓</button>
                  <button type="button" title="Duplicate" onClick={() => insert(i + 1, { ...JSON.parse(JSON.stringify(blk)), id: uid() })}>⧉</button>
                  <button type="button" title="Delete" className="danger" onClick={() => set({ blocks: doc.blocks.filter((_, k) => k !== i) })}>✕</button>
                </span>
              </div>
              {open === blk.id && <div className="em-block-body"><BlockFields blk={blk} set={(p) => setBlock(i, p)} meta={meta} /></div>}
            </div>
            <Inserter open={adding === i + 1} onToggle={() => setAdding(adding === i + 1 ? null : i + 1)} onPick={(b2) => insert(i + 1, b2)} />
          </div>
        ))}
        {doc.blocks.length === 0 && <p className="muted-2" style={{ fontSize: 13 }}>No content yet. Add a block above.</p>}
      </div>
    </fieldset>
  );
}

function summary(b: EmailBlock): string {
  const t = (s?: string) => (s || '').replace(/\s+/g, ' ').slice(0, 70);
  switch (b.type) {
    case 'heading': return t(b.text);
    case 'text': return t(b.text) || 'Empty';
    case 'image': return b.alt || b.url || 'No image yet';
    case 'button': return `${b.label} → ${b.url}`;
    case 'storeBadges': return [b.ios && 'App Store', b.android && 'Google Play'].filter(Boolean).join(' + ');
    case 'icons': return b.items.join(', ');
    case 'quote': return t(b.text);
    case 'callout': return t(b.title || b.text);
    case 'list': return `${b.items.length} item(s)`;
    case 'references': return `${b.items.length} source(s)`;
    case 'signoff': return b.name;
    case 'spacer': return `${b.size ?? 16}px`;
    default: return '';
  }
}

function Inserter({ open, onToggle, onPick }: { open: boolean; onToggle: () => void; onPick: (b: EmailBlock) => void }) {
  return (
    <div className="em-insert">
      <button type="button" className="em-insert-btn" onClick={onToggle}>{open ? 'Close' : '+ Add block'}</button>
      {open && (
        <div className="em-palette">
          {BLOCK_PALETTE.map((p) => (
            <button type="button" key={p.type} onClick={() => onPick(p.make())}>
              <b>{p.label}</b><span>{p.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const Align = ({ value, onChange }: { value?: string; onChange: (v: 'left' | 'center') => void }) => (
  <div className="seg em-seg-sm">
    <button type="button" className={value !== 'center' ? 'active' : ''} onClick={() => onChange('left')}>Left</button>
    <button type="button" className={value === 'center' ? 'active' : ''} onClick={() => onChange('center')}>Centre</button>
  </div>
);

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <div className="field"><label>{label}</label>{children}{hint && <div className="hint">{hint}</div>}</div>;
}

function BlockFields({ blk, set, meta }: { blk: EmailBlock; set: (p: any) => void; meta: EmailMeta | null }) {
  switch (blk.type) {
    case 'heading':
      return (<>
        <Field label="Eyebrow (small red line above)"><input value={blk.eyebrow || ''} onChange={(e) => set({ eyebrow: e.target.value })} /></Field>
        <Field label="Heading"><input value={blk.text} onChange={(e) => set({ text: e.target.value })} /></Field>
        <Field label="Red second line (optional)"><input value={blk.accent || ''} onChange={(e) => set({ accent: e.target.value })} /></Field>
        <div className="row em-row-wrap">
          <Field label="Size"><div className="seg em-seg-sm">{(['xl', 'lg', 'md'] as const).map((s) => <button type="button" key={s} className={(blk.size || 'xl') === s ? 'active' : ''} onClick={() => set({ size: s })}>{s === 'xl' ? 'Large' : s === 'lg' ? 'Medium' : 'Small'}</button>)}</div></Field>
          <Field label="Align"><Align value={blk.align} onChange={(align) => set({ align })} /></Field>
        </div>
      </>);
    case 'text':
      return (<>
        <Field label="Text" hint="Blank line = new paragraph. **bold**, *italic*, [label](https://…), {{first_name}}"><textarea rows={6} value={blk.text} onChange={(e) => set({ text: e.target.value })} /></Field>
        <div className="row em-row-wrap">
          <Field label="Size"><div className="seg em-seg-sm"><button type="button" className={blk.size !== 'sm' ? 'active' : ''} onClick={() => set({ size: 'md' })}>Normal</button><button type="button" className={blk.size === 'sm' ? 'active' : ''} onClick={() => set({ size: 'sm' })}>Small</button></div></Field>
          <Field label="Colour"><div className="seg em-seg-sm"><button type="button" className={blk.tone !== 'muted' ? 'active' : ''} onClick={() => set({ tone: 'default' })}>Dark</button><button type="button" className={blk.tone === 'muted' ? 'active' : ''} onClick={() => set({ tone: 'muted' })}>Grey</button></div></Field>
          <Field label="Align"><Align value={blk.align} onChange={(align) => set({ align })} /></Field>
        </div>
      </>);
    case 'image':
      return <ImageFields blk={blk} set={set} />;
    case 'button':
      return (<>
        <div className="row em-row-wrap">
          <Field label="Label"><input value={blk.label} onChange={(e) => set({ label: e.target.value })} /></Field>
          <Field label="Link"><input value={blk.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://" /></Field>
        </div>
        <div className="row em-row-wrap">
          <Field label="Style"><div className="seg em-seg-sm">{(['primary', 'dark', 'outline'] as const).map((v) => <button type="button" key={v} className={(blk.variant || 'primary') === v ? 'active' : ''} onClick={() => set({ variant: v })}>{v === 'primary' ? 'Red' : v === 'dark' ? 'Black' : 'Outline'}</button>)}</div></Field>
          <Field label="Align"><Align value={blk.align} onChange={(align) => set({ align })} /></Field>
        </div>
      </>);
    case 'storeBadges':
      return (<>
        <div className="em-checks">
          <label><input type="checkbox" checked={blk.ios} onChange={(e) => set({ ios: e.target.checked })} /> App Store</label>
          <label><input type="checkbox" checked={blk.android} onChange={(e) => set({ android: e.target.checked })} /> Google Play</label>
        </div>
        <Field label="Caption (optional)"><input value={blk.caption || ''} onChange={(e) => set({ caption: e.target.value })} /></Field>
        <Field label="Align"><Align value={blk.align} onChange={(align) => set({ align })} /></Field>
      </>);
    case 'icons': {
      const icons = meta?.icons ?? [];
      const toggle = (id: IconName) => set({ items: blk.items.includes(id) ? blk.items.filter((x) => x !== id) : [...blk.items, id] });
      return (<>
        <div className="em-icon-grid">
          {icons.map((ic) => (
            <button type="button" key={ic.id} className={blk.items.includes(ic.id) ? 'on' : ''} onClick={() => toggle(ic.id)} title={ic.label}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ic.url} alt="" width={28} height={28} /><span>{ic.label}</span>
            </button>
          ))}
        </div>
        <div className="row em-row-wrap">
          <Field label={`Size: ${blk.size ?? 36}px`}><input type="range" min={20} max={64} value={blk.size ?? 36} onChange={(e) => set({ size: Number(e.target.value) })} /></Field>
          <Field label="Align"><Align value={blk.align} onChange={(align) => set({ align })} /></Field>
        </div>
        <Field label="Caption (optional)"><input value={blk.caption || ''} onChange={(e) => set({ caption: e.target.value })} placeholder="ALL MODES · ALL LIVE" /></Field>
      </>);
    }
    case 'quote':
      return (<>
        <Field label="Quote"><textarea rows={3} value={blk.text} onChange={(e) => set({ text: e.target.value })} /></Field>
        <div className="row em-row-wrap">
          <Field label="Source"><input value={blk.cite || ''} onChange={(e) => set({ cite: e.target.value })} placeholder="TfL, FOI-1277-2526, July 2025" /></Field>
          <Field label="Source link"><input value={blk.citeUrl || ''} onChange={(e) => set({ citeUrl: e.target.value })} placeholder="https://" /></Field>
        </div>
      </>);
    case 'callout':
      return (<>
        <Field label="Title (optional)"><input value={blk.title || ''} onChange={(e) => set({ title: e.target.value })} /></Field>
        <Field label="Text"><textarea rows={3} value={blk.text} onChange={(e) => set({ text: e.target.value })} /></Field>
        <Field label="Colour"><div className="seg em-seg-sm">{(['info', 'warning', 'success', 'note'] as const).map((t) => <button type="button" key={t} className={(blk.tone || 'note') === t ? 'active' : ''} onClick={() => set({ tone: t })}>{t === 'info' ? 'Blue' : t === 'warning' ? 'Amber' : t === 'success' ? 'Green' : 'Grey'}</button>)}</div></Field>
      </>);
    case 'list':
      return (<>
        <Field label="Items" hint="One per line"><textarea rows={5} value={blk.items.join('\n')} onChange={(e) => set({ items: e.target.value.split('\n') })} /></Field>
        <div className="em-checks"><label><input type="checkbox" checked={!!blk.ordered} onChange={(e) => set({ ordered: e.target.checked })} /> Numbered</label></div>
      </>);
    case 'references':
      return (<>
        <Field label="Title"><input value={blk.title || ''} onChange={(e) => set({ title: e.target.value })} /></Field>
        {blk.items.map((r, k) => (
          <div className="row em-row-wrap em-ref" key={k}>
            <span className="em-ref-n">[{k + 1}]</span>
            <input value={r.text} placeholder="Title, publisher, date" onChange={(e) => set({ items: blk.items.map((x, j) => (j === k ? { ...x, text: e.target.value } : x)) })} />
            <input value={r.url || ''} placeholder="https://" onChange={(e) => set({ items: blk.items.map((x, j) => (j === k ? { ...x, url: e.target.value } : x)) })} />
            <button type="button" className="btn-ghost" onClick={() => set({ items: blk.items.filter((_, j) => j !== k) })}>✕</button>
          </div>
        ))}
        <button type="button" className="btn-ghost" onClick={() => set({ items: [...blk.items, { text: '', url: '' }] })}>+ Reference</button>
      </>);
    case 'signoff':
      return (<>
        <Field label="Closing line (optional)"><input value={blk.text || ''} onChange={(e) => set({ text: e.target.value })} placeholder="Thanks for using Stationly." /></Field>
        <div className="row em-row-wrap">
          <Field label="Name"><input value={blk.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Role (optional)"><input value={blk.role || ''} onChange={(e) => set({ role: e.target.value })} /></Field>
        </div>
      </>);
    case 'spacer':
      return <Field label={`Height: ${blk.size ?? 16}px`}><input type="range" min={4} max={80} value={blk.size ?? 16} onChange={(e) => set({ size: Number(e.target.value) })} /></Field>;
    case 'divider':
      return <p className="muted-2" style={{ fontSize: 13, margin: 0 }}>A thin grey line. Nothing to set.</p>;
  }
}

/**
 * The proxies in front of the console and the API accept about 1 MB per
 * request (nginx's default), and the upload travels as base64 JSON. So the
 * image is shrunk HERE first: at most 1600 px wide (the server makes it 1200),
 * re-encoded until it fits. GIFs are sent as they are (re-encoding would stop
 * the animation), so they must already be small.
 */
const MAX_UPLOAD_CHARS = 700_000;
async function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });
}
async function shrinkForUpload(file: File): Promise<string> {
  if (file.type === 'image/gif') {
    const d = await readAsDataUrl(file);
    if (d.length > MAX_UPLOAD_CHARS) throw new Error('GIFs must be under about 500 KB. Use a PNG or JPEG for larger images.');
    return d;
  }
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('That file is not an image this browser can read.'); });
  const png = file.type === 'image/png' || file.type === 'image/webp';
  let width = Math.min(1600, bitmap.width);
  let quality = 0.88;
  for (let i = 0; i < 8; i++) {
    const height = Math.round((bitmap.height / bitmap.width) * width);
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    if (!png) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); }
    ctx.drawImage(bitmap, 0, 0, width, height);
    // PNG keeps transparency; if it's too big, fall back to JPEG on white.
    const asPng = png && i < 2;
    if (!asPng && png) { ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); }
    const out = canvas.toDataURL(asPng ? 'image/png' : 'image/jpeg', quality);
    if (out.length <= MAX_UPLOAD_CHARS) return out;
    if (!asPng) { width = Math.round(width * 0.8); quality = Math.max(0.6, quality - 0.08); }
  }
  throw new Error('That image is too detailed to upload. Try a smaller one.');
}

function ImageFields({ blk, set }: { blk: Extract<EmailBlock, { type: 'image' }>; set: (p: any) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [library, setLibrary] = useState<EmailAsset[] | null>(null);

  const upload = async (file: File) => {
    setError('');
    if (file.size > 25 * 1024 * 1024) { setError('Images must be under 25 MB.'); return; }
    setBusy(true);
    try {
      const dataUrl = await shrinkForUpload(file);
      const a = await fetchJson<EmailAsset>('/api/admin/email/assets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl, name: file.name }),
      });
      set({ url: a.url, alt: blk.alt || file.name.replace(/\.[a-z]+$/i, '').replace(/[-_]/g, ' '), width: Math.min(520, a.width) });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const openLibrary = async () => {
    setError('');
    try { setLibrary((await fetchJson<{ items: EmailAsset[] }>('/api/admin/email/assets')).items); }
    catch (e: any) { setError(e.message); }
  };

  return (<>
    <div
      className={`em-drop ${busy ? 'busy' : ''}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void upload(f); }}
    >
      {blk.url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={blk.url} alt="" />
        : <span>Drop an image here</span>}
      <div className="em-drop-actions">
        <button type="button" className="btn-ghost" onClick={() => input.current?.click()} disabled={busy}>{busy ? 'Uploading…' : blk.url ? 'Replace' : 'Upload'}</button>
        <button type="button" className="btn-ghost" onClick={openLibrary}>Library</button>
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
    </div>
    {error && <div className="em-error">{error}</div>}
    {library && (
      <div className="em-library">
        {library.length === 0 && <span className="muted-2">Nothing uploaded yet.</span>}
        {library.map((a) => (
          // eslint-disable-next-line @next/next/no-img-element
          <button type="button" key={a.id} title={`${a.name} · ${a.width}×${a.height} · ${Math.round(a.bytes / 1024)} KB`} onClick={() => { set({ url: a.url, alt: blk.alt || a.name, width: Math.min(520, a.width) }); setLibrary(null); }}><img src={a.url} alt="" /></button>
        ))}
      </div>
    )}
    <Field label="Image link" hint="Uploads are resized to 1200px, compressed, and hosted by the Stationly API."><input value={blk.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://" /></Field>
    <Field label="Alt text" hint="Shown when images are off. Describe the picture."><input value={blk.alt} onChange={(e) => set({ alt: e.target.value })} /></Field>
    <div className="row em-row-wrap">
      <Field label="Opens (optional)"><input value={blk.href || ''} onChange={(e) => set({ href: e.target.value || undefined })} placeholder="https://" /></Field>
      <Field label="Caption (optional)"><input value={blk.caption || ''} onChange={(e) => set({ caption: e.target.value })} /></Field>
    </div>
    <div className="row em-row-wrap">
      <Field label={`Width: ${blk.width ?? 520}px`}><input type="range" min={80} max={520} step={10} value={blk.width ?? 520} onChange={(e) => set({ width: Number(e.target.value) })} /></Field>
      <Field label="Align"><Align value={blk.align} onChange={(align) => set({ align })} /></Field>
    </div>
    <div className="em-checks"><label><input type="checkbox" checked={blk.rounded !== false} onChange={(e) => set({ rounded: e.target.checked })} /> Rounded corners</label></div>
  </>);
}
