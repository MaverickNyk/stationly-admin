'use client';

import Toolbar from './ui/Toolbar';
import ErrorBanner from './ui/ErrorBanner';
import { useResource } from '@/lib/useResource';

interface About {
  appName: string;
  version: string;
  envLabel: string;
  backendUrl: string;
  websiteUrl: string;
  hasAdminKey: boolean;
  hasApiKey: boolean;
  hasCfToken: boolean;
  nodeVersion: string;
  uptimeSeconds: number;
}

function uptime(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

function Flag({ ok }: { ok: boolean }) {
  return <span className={`pill ${ok ? 'on' : 'off'}`}>{ok ? 'configured' : 'missing'}</span>;
}

export default function AboutPanel() {
  const { data, busy, error, reload } = useResource<About>('/api/admin/about');

  return (
    <div>
      <Toolbar>
        <button onClick={() => reload()} disabled={busy}>
          {busy ? '…' : '↻ Refresh'}
        </button>
      </Toolbar>

      <ErrorBanner message={error} onRetry={() => reload()} busy={busy} />

      <div className="card">
        <h2>Build &amp; runtime</h2>
        <div className="about-grid">
          <div>
            <span>Console</span>
            <b>{data ? `${data.appName} v${data.version}` : '…'}</b>
          </div>
          <div>
            <span>Environment</span>
            <b>{data?.envLabel ?? '…'}</b>
          </div>
          <div>
            <span>Backend URL</span>
            <code>{data?.backendUrl ?? '…'}</code>
          </div>
          <div>
            <span>Website URL</span>
            <code>{data?.websiteUrl ?? '…'}</code>
          </div>
          <div>
            <span>Node</span>
            <b>{data?.nodeVersion ?? '…'}</b>
          </div>
          <div>
            <span>Server uptime</span>
            <b>{data ? uptime(data.uptimeSeconds) : '…'}</b>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Credentials (presence only)</h2>
        <div className="about-grid">
          <div>
            <span>Admin key</span>
            <b>{data ? <Flag ok={data.hasAdminKey} /> : '…'}</b>
          </div>
          <div>
            <span>Public API key</span>
            <b>{data ? <Flag ok={data.hasApiKey} /> : '…'}</b>
          </div>
          <div>
            <span>Cloudflare token</span>
            <b>{data ? <Flag ok={data.hasCfToken} /> : '…'}</b>
          </div>
        </div>
        <p className="empty" style={{ marginTop: 14 }}>
          Presence only — the secret values themselves never leave the server.
        </p>
      </div>
    </div>
  );
}
