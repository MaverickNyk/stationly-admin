/**
 * TLS certificate expiry check. An expired (or about-to-expire) cert silently
 * blocks the app — the client refuses the connection before any request. We
 * open a raw TLS socket, read the peer certificate's `valid_to`, and report
 * days remaining. Non-throwing + timed, like the HTTP probes.
 */
import 'server-only';
import tls from 'node:tls';

export interface TlsResult {
  /** Whole days until the cert expires (negative if already expired). */
  daysLeft: number | null;
  /** Cert `valid_to` as an ISO string, when available. */
  validTo: string | null;
  latencyMs: number;
  error?: string;
}

export function checkTls(host: string, port = 443, timeoutMs = 10_000): Promise<TlsResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    let settled = false;
    const done = (r: Omit<TlsResult, 'latencyMs'>) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve({ ...r, latencyMs: Date.now() - started });
    };

    const socket = tls.connect(
      { host, port, servername: host, timeout: timeoutMs },
      () => {
        const cert = socket.getPeerCertificate();
        if (!cert || !cert.valid_to) {
          done({ daysLeft: null, validTo: null, error: 'no certificate presented' });
          return;
        }
        const expiry = new Date(cert.valid_to).getTime();
        const daysLeft = Math.floor((expiry - Date.now()) / 86_400_000);
        done({ daysLeft, validTo: new Date(expiry).toISOString() });
      },
    );

    socket.on('timeout', () => done({ daysLeft: null, validTo: null, error: `timeout after ${timeoutMs}ms` }));
    socket.on('error', (e: any) => done({ daysLeft: null, validTo: null, error: e?.message ?? 'TLS error' }));
  });
}
