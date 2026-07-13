/**
 * Server-only client for the Stationly backend admin API.
 *
 * THE security boundary: each environment's `ADMIN_KEY` and Cloudflare
 * service token live here, in the Next server's env, and are attached to
 * outbound requests. They are NEVER sent to the browser. The browser talks
 * only to this app's own /api/admin/* proxy routes (gated by the session
 * cookie); the target env is fixed by the deployment (staging | prod) and
 * resolved here server-side — never chosen by the browser.
 *
 * `import 'server-only'` makes the build fail loudly if this module is ever
 * imported into a Client Component.
 */
import 'server-only';
import type { SendRequest, SendResult } from './payload';
import { resolveEnv, type EnvName } from './env';

/** Default per-probe timeout for the health checks (overridable per call). */
const DEFAULT_PROBE_TIMEOUT_MS = 10_000;

function adminHeaders(env: EnvName): { url: string; headers: Record<string, string> } {
  const cfg = resolveEnv(env);
  if (!cfg.adminKey) {
    throw new Error(`No admin key configured for "${env}" (set ADMIN_KEY).`);
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cfg.adminKey}`,
  };
  // Cloudflare Access service token — attached only when configured for this
  // env, so the proxy can authenticate machine-to-machine through Access.
  if (cfg.cfClientId && cfg.cfClientSecret) {
    headers['CF-Access-Client-Id'] = cfg.cfClientId;
    headers['CF-Access-Client-Secret'] = cfg.cfClientSecret;
  }
  return { url: cfg.baseUrl, headers };
}

export interface BackendResponse<T> {
  ok: boolean;
  status: number;
  data: T | { error?: string; message?: string };
}

export async function sendNotification(
  env: EnvName,
  body: SendRequest,
): Promise<BackendResponse<SendResult>> {
  const { url, headers } = adminHeaders(env);
  const res = await fetch(`${url}/api/v1/admin/notifications/send`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  let data: any;
  try {
    data = await res.json();
  } catch {
    data = { message: await res.text().catch(() => 'Unreadable response') };
  }
  return { ok: res.ok, status: res.status, data };
}

export interface HistoryItem {
  id: string;
  createdAt: number;
  audienceType: string;
  audienceSummary: string;
  payloadType: string;
  title: string;
  body: string;
  severity: string;
  successCount: number;
  failureCount: number;
  messageId: string;
  ok: number; // 0 | 1
}

/** Recent admin sends from a given env's local audit log. */
export async function getHistory(
  env: EnvName,
  limit = 50,
): Promise<BackendResponse<{ items: HistoryItem[]; count: number }>> {
  const { url, headers } = adminHeaders(env);
  const res = await fetch(
    `${url}/api/v1/admin/notifications/history?limit=${encodeURIComponent(String(limit))}`,
    { method: 'GET', headers, cache: 'no-store' },
  );

  let data: any;
  try {
    data = await res.json();
  } catch {
    data = { message: await res.text().catch(() => 'Unreadable response') };
  }
  return { ok: res.ok, status: res.status, data };
}

// ── Read-only data views ──────────────────────────────────────────────

export interface DashboardStats {
  transport: { stations: number; lines: number; modes: number; lineStatuses: number };
  subscribedStations: number;
  users: { total: number; active: number; refreshedAt: number };
  waitlist: { total: number; refreshedAt: number };
  recentNotifications: HistoryItem[];
}

export interface AdminUser {
  uid: string;
  email: string;
  displayName: string;
  createdAt: number;
  lastLoggedInTime: number;
  loggedIn: boolean;
  emailVerified: boolean;
  stationCount: number;
}

export interface WaitlistEntry {
  id: string;
  email: string;
  joinedAt: number;
}

export interface SubscribedStation {
  naptanId: string;
  count: number;
  commonName: string | null;
  lat: number | null;
  lon: number | null;
  modes: string[];
}

async function getJson<T>(env: EnvName, path: string): Promise<BackendResponse<T>> {
  const { url, headers } = adminHeaders(env);
  const res = await fetch(`${url}/api/v1${path}`, { method: 'GET', headers, cache: 'no-store' });
  let data: any;
  try {
    data = await res.json();
  } catch {
    data = { message: await res.text().catch(() => 'Unreadable response') };
  }
  return { ok: res.ok, status: res.status, data };
}

export const getStats = (env: EnvName) =>
  getJson<DashboardStats>(env, '/admin/stats');

export const getUsers = (env: EnvName, refresh = false) =>
  getJson<{ items: AdminUser[]; count: number; cached: boolean; refreshedAt: number }>(
    env,
    `/admin/users${refresh ? '?refresh=1' : ''}`,
  );

export const getWaitlist = (env: EnvName, refresh = false) =>
  getJson<{ items: WaitlistEntry[]; count: number; cached: boolean; refreshedAt: number }>(
    env,
    `/admin/waitlist${refresh ? '?refresh=1' : ''}`,
  );

export const getSubscribedStations = (env: EnvName) =>
  getJson<{ items: SubscribedStation[]; count: number }>(env, '/admin/subscribed-stations');

export interface DeviceSession {
  deviceId: string;
  platform?: string;
  osVersion?: string;
  model?: string;
  appVersion?: string;
  firstSeen?: string;
  lastSeen?: string;
}

export interface UserStation {
  id: string;
  name: string;
  line: string;
  mode: string;
  direction?: string;
}

export interface UserDetail {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  signInProvider: string;
  createdAt: number;
  updatedAt: number;
  lastLoggedInTime: number;
  loggedIn: boolean;
  emailVerified: boolean;
  stationCount: number;
  sessions: DeviceSession[];
  stations: UserStation[];
}

export const getUserDetail = (env: EnvName, uid: string) =>
  getJson<UserDetail>(env, `/admin/users/${encodeURIComponent(uid)}`);

// ── Health probes ─────────────────────────────────────────────────────
//
// Low-level, NON-THROWING, timed requests for the health dashboard. They keep
// the credentials (admin key, client X-Stationly-Key, CF token) inside this
// server-only boundary; the caller (lib/health/checks.ts) only ever sees a
// RawProbe (status code + latency + parsed body), never the secrets. A failed
// request (timeout, DNS, connection refused) becomes `httpCode: 0` + `error`,
// never an exception.

export interface RawProbe {
  /** HTTP status, or 0 when the request never completed (timeout/network). */
  httpCode: number;
  latencyMs: number;
  /** Set when the request never completed. */
  error?: string;
  /** Parsed JSON body when the response was JSON (used for chained discovery). */
  json?: any;
}

async function timedFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<RawProbe> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: 'no-store' });
    const latencyMs = Date.now() - started;
    const body = await res.text().catch(() => '');
    let json: any;
    try {
      json = body ? JSON.parse(body) : undefined;
    } catch {
      /* non-JSON body — fine, leave json undefined */
    }
    return { httpCode: res.status, latencyMs, json };
  } catch (e: any) {
    const latencyMs = Date.now() - started;
    const error =
      e?.name === 'AbortError'
        ? `timeout after ${timeoutMs}ms`
        : (e?.message ?? 'network error');
    return { httpCode: 0, latencyMs, error };
  } finally {
    clearTimeout(timer);
  }
}

/** Whether this env has the public client key configured. */
export function hasApiKey(env: EnvName): boolean {
  return Boolean(resolveEnv(env).apiKey);
}

/** Unauthenticated liveness root: `GET /`. */
export function probeRoot(env: EnvName, timeoutMs = DEFAULT_PROBE_TIMEOUT_MS): Promise<RawProbe> {
  const { baseUrl } = resolveEnv(env);
  return timedFetch(`${baseUrl}/`, { method: 'GET' }, timeoutMs);
}

/**
 * Probe a public app endpoint exactly as the app does — attaching the client
 * `X-Stationly-Key`. `path` is the full `/api/v1`-relative path INCLUDING any
 * query string (the caller builds it). Returns `httpCode: 0, error` if the key
 * is unset so the caller can mark it `skipped`.
 */
export function probePublic(
  env: EnvName,
  path: string,
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
): Promise<RawProbe> {
  const cfg = resolveEnv(env);
  if (!cfg.apiKey) {
    return Promise.resolve({ httpCode: 0, latencyMs: 0, error: 'STATIONLY_API_KEY not set' });
  }
  return timedFetch(
    `${cfg.baseUrl}/api/v1${path}`,
    { method: 'GET', headers: { 'X-Stationly-Key': cfg.apiKey } },
    timeoutMs,
  );
}

/**
 * Probe the website waitlist form target (`POST /api/v1/waitlist/join`) — it is
 * mounted ahead of the X-Stationly-Key middleware (no key) so we send a
 * malformed body; the controller rejects it with 400 at validation, creating no
 * row. Confirms the public form endpoint the marketing site posts to is alive.
 */
export function probeWaitlistJoin(env: EnvName, timeoutMs = DEFAULT_PROBE_TIMEOUT_MS): Promise<RawProbe> {
  const { baseUrl } = resolveEnv(env);
  return timedFetch(
    `${baseUrl}/api/v1/waitlist/join`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
    timeoutMs,
  );
}

/**
 * Probe a user-auth-gated route at its auth gate: client key present, NO
 * Firebase bearer. The auth middleware rejects with 401 before the handler, so
 * this proves the route is mounted and not 5xx-ing with zero side effects.
 */
export function probeUserGate(
  env: EnvName,
  method: 'GET' | 'POST',
  path: string,
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
): Promise<RawProbe> {
  const cfg = resolveEnv(env);
  if (!cfg.apiKey) {
    return Promise.resolve({ httpCode: 0, latencyMs: 0, error: 'STATIONLY_API_KEY not set' });
  }
  const headers: Record<string, string> = { 'X-Stationly-Key': cfg.apiKey };
  const init: RequestInit = { method, headers };
  if (method === 'POST') {
    headers['Content-Type'] = 'application/json';
    init.body = '{}';
  }
  return timedFetch(`${cfg.baseUrl}/api/v1${path}`, init, timeoutMs);
}

/**
 * Probe the admin auth + send pipeline: POST an empty body. A 400 means the
 * backend is up AND the admin key matches (validation rejects the empty body);
 * 403 = key mismatch, 503 = backend key unset. See OPERATIONS.md §8.
 */
export function probeAdminAuth(env: EnvName, timeoutMs = DEFAULT_PROBE_TIMEOUT_MS): Promise<RawProbe> {
  let cfg: { url: string; headers: Record<string, string> };
  try {
    cfg = adminHeaders(env);
  } catch (e: any) {
    return Promise.resolve({ httpCode: 0, latencyMs: 0, error: e?.message ?? 'ADMIN_KEY not set' });
  }
  return timedFetch(
    `${cfg.url}/api/v1/admin/notifications/send`,
    { method: 'POST', headers: cfg.headers, body: '{}' },
    timeoutMs,
  );
}

/** Timed GET against an admin endpoint, carrying the admin key (+ CF token). */
export function probeAdminGet(
  env: EnvName,
  path: string,
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
): Promise<RawProbe> {
  let cfg: { url: string; headers: Record<string, string> };
  try {
    cfg = adminHeaders(env);
  } catch (e: any) {
    return Promise.resolve({ httpCode: 0, latencyMs: 0, error: e?.message ?? 'ADMIN_KEY not set' });
  }
  return timedFetch(`${cfg.url}/api/v1${path}`, { method: 'GET', headers: cfg.headers }, timeoutMs);
}

/**
 * Probe the Syncer's own status API (`GET /sync-status`) — only when `SYNCER_URL`
 * is configured. Carries the optional bearer key (`SYNCER_STATUS_KEY`). The full
 * summary JSON comes back in `probe.json` for the dashboard's detail modal.
 * Returns `httpCode: 0` when the URL is unset or the Syncer is unreachable, so
 * the caller can fall back to inferring health from backend data freshness.
 */
export function probeSyncer(env: EnvName, timeoutMs = DEFAULT_PROBE_TIMEOUT_MS): Promise<RawProbe> {
  const cfg = resolveEnv(env);
  if (!cfg.syncerUrl) {
    return Promise.resolve({ httpCode: 0, latencyMs: 0, error: 'SYNCER_URL not set' });
  }
  const headers: Record<string, string> = {};
  if (cfg.syncerKey) headers.Authorization = `Bearer ${cfg.syncerKey}`;
  return timedFetch(`${cfg.syncerUrl}/sync-status`, { method: 'GET', headers }, timeoutMs);
}
