/**
 * Probe the public StationUI website. No secrets involved, so this lives
 * outside the server-only lib/backend.ts boundary. Non-throwing + timed, same
 * shape as the backend RawProbe.
 */
import type { RawProbe } from '../backend';

export async function probeWebsite(
  url: string,
  timeoutMs = 10_000,
  extraHeaders?: Record<string, string>,
): Promise<RawProbe> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'stationly-admin-healthcheck', ...extraHeaders },
    });
    return { httpCode: res.status, latencyMs: Date.now() - started };
  } catch (e: any) {
    const error =
      e?.name === 'AbortError'
        ? `timeout after ${timeoutMs}ms`
        : (e?.message ?? 'network error');
    return { httpCode: 0, latencyMs: Date.now() - started, error };
  } finally {
    clearTimeout(timer);
  }
}
