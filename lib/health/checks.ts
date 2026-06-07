/**
 * The health cycle: runs every probe once and writes the results to the store.
 *
 * The public app endpoints are probed with CHAINED DISCOVERY so the params are
 * real (mirroring the app's own navigation): /modes seeds a mode, /lines/mode
 * seeds a lineId, /stations/line seeds a naptanId. Static env fallbacks keep
 * each probe meaningful even if a parent probe failed. The syncer (which has no
 * endpoint) is inferred from whether that data is present and fresh.
 */
import 'server-only';
import type { EnvName } from '../env';
import { resolveEnv, websiteUrl } from '../env';
import {
  probeRoot,
  probePublic,
  probeUserGate,
  probeAdminAuth,
  probeAdminGet,
  probeWaitlistJoin,
  type RawProbe,
} from '../backend';
import { probeWebsite } from './website';
import { checkTls } from './tls';
import { notifyTransitions } from './notify';
import { record, setRunning, markCycleComplete, drainTransitions } from './store';
import {
  ADMIN_CHECKS,
  LIVENESS_CHECK,
  PUBLIC_CHECKS,
  SYNCER_CHECK,
  TLS_CHECKS,
  USER_CHECKS,
  WEBSITE_CHECK,
} from './registry';
import type { CheckDef, CheckResult, CheckStatus } from './types';

function envInt(name: string, def: number, min: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= min ? Math.floor(n) : def;
}

const TIMEOUT_MS = envInt('HEALTHCHECK_TIMEOUT_MS', 10_000, 1000);
/** An "up" probe slower than this is downgraded to "degraded (slow)". */
const SLOW_MS = envInt('HEALTHCHECK_SLOW_MS', 2500, 100);
/** TLS cert within this many days of expiry ⇒ degraded. */
const TLS_WARN_DAYS = envInt('HEALTHCHECK_TLS_WARN_DAYS', 14, 1);

const SAMPLE_SEARCH = process.env.HEALTHCHECK_SEARCH || 'king';
const [SAMPLE_LAT, SAMPLE_LON] = (process.env.HEALTHCHECK_LATLON || '51.5074,-0.1278')
  .split(',')
  .map((s) => s.trim());
// Line statuses poll every 10m and only re-stamp on CHANGE, so a quiet network
// can legitimately go a while without an update — only flag as stale when the
// newest status is older than this (default 24h), and treat it as degraded
// (informational), never down. Data *presence* is the real down signal.
const SYNCER_STALE_MS = envInt('HEALTHCHECK_SYNCER_STALE_MS', 24 * 60 * 60 * 1000, 60_000);

// ── helpers ───────────────────────────────────────────────────────────

function mkResult(def: CheckDef, probe: RawProbe, status: CheckStatus, detail: string): CheckResult {
  return {
    id: def.id,
    group: def.group,
    label: def.label,
    method: def.method,
    path: def.path,
    expected: def.expected,
    status,
    httpCode: probe.httpCode,
    latencyMs: probe.latencyMs,
    checkedAt: Date.now(),
    detail,
    since: 0, // authoritative since/fails are derived in store.record()
    fails: 0,
  };
}

/** An "up" but slow probe is downgraded to "degraded (slow)" so creeping
 * latency is visible before a full outage. Other statuses pass through. */
function applySlow(c: { status: CheckStatus; detail: string }, latencyMs: number): { status: CheckStatus; detail: string } {
  if (c.status === 'up' && latencyMs > SLOW_MS) {
    return { status: 'degraded', detail: `slow · ${latencyMs}ms (>${SLOW_MS}ms)` };
  }
  return c;
}

/** Standard classification for "expect 200" endpoints. */
function classify200(probe: RawProbe): { status: CheckStatus; detail: string } {
  if (probe.error?.includes('STATIONLY_API_KEY')) return { status: 'skipped', detail: 'no client key (STATIONLY_API_KEY unset)' };
  if (probe.httpCode === 0) return { status: 'down', detail: probe.error ?? 'no response' };
  if (probe.httpCode >= 500) return { status: 'down', detail: `HTTP ${probe.httpCode}` };
  if (probe.httpCode === 429) return { status: 'degraded', detail: '429 rate-limited' };
  if (probe.httpCode === 200) return applySlow({ status: 'up', detail: `200 · ${probe.latencyMs}ms` }, probe.latencyMs);
  if (probe.httpCode === 401 || probe.httpCode === 403) return { status: 'degraded', detail: `HTTP ${probe.httpCode} (auth/key)` };
  return { status: 'degraded', detail: `HTTP ${probe.httpCode} (expected 200)` };
}

/** Classification for the user auth-gate probes (expect 401 = route alive). */
function classifyGate(probe: RawProbe): { status: CheckStatus; detail: string } {
  if (probe.error?.includes('STATIONLY_API_KEY')) return { status: 'skipped', detail: 'no client key (STATIONLY_API_KEY unset)' };
  if (probe.httpCode === 0) return { status: 'down', detail: probe.error ?? 'no response' };
  if (probe.httpCode >= 500) return { status: 'down', detail: `HTTP ${probe.httpCode}` };
  if (probe.httpCode === 429) return { status: 'degraded', detail: '429 rate-limited' };
  if (probe.httpCode === 401) return applySlow({ status: 'up', detail: `401 gate · ${probe.latencyMs}ms` }, probe.latencyMs);
  if (probe.httpCode === 403) return { status: 'degraded', detail: '403 (client key invalid)' };
  return { status: 'degraded', detail: `HTTP ${probe.httpCode} (expected 401)` };
}

/** First usable id from an array body, trying the given fields in order. */
function pickField(json: any, fields: string[]): string | undefined {
  if (!Array.isArray(json) || json.length === 0) return undefined;
  const item = json[0];
  if (typeof item === 'string') return item;
  if (item == null) return undefined;
  for (const f of fields) {
    const v = item[f];
    if (typeof v === 'string' && v) return v;
    if (typeof v === 'number') return String(v);
  }
  return undefined;
}

function byId(defs: CheckDef[], id: string): CheckDef {
  const d = defs.find((x) => x.id === id);
  if (!d) throw new Error(`health: unknown check id ${id}`);
  return d;
}

// ── the cycle ─────────────────────────────────────────────────────────

/**
 * In-flight cycle, so a manual "Run check now" that overlaps the 5-min
 * scheduled cycle coalesces into the SAME run instead of double-probing every
 * endpoint and double-firing alerts. Mirrors the backend's own
 * single-flight pattern (LineController.inFlightStatusRefresh).
 */
let inFlightCycle: Promise<void> | null = null;

export function runHealthCycle(env: EnvName): Promise<void> {
  if (inFlightCycle) return inFlightCycle;
  inFlightCycle = runCycle(env).finally(() => {
    inFlightCycle = null;
  });
  return inFlightCycle;
}

async function runCycle(env: EnvName): Promise<void> {
  setRunning(true);
  try {
    // 1. Liveness — GET /
    {
      const probe = await probeRoot(env, TIMEOUT_MS);
      let status: CheckStatus = 'down';
      let detail = probe.error ?? `HTTP ${probe.httpCode}`;
      if (probe.httpCode === 200) {
        const online = typeof probe.json?.status === 'string' && /online/i.test(probe.json.status);
        status = 'up';
        detail = online ? `online · ${probe.latencyMs}ms` : `200 · ${probe.latencyMs}ms`;
      } else if (probe.httpCode >= 500 || probe.httpCode === 0) {
        status = 'down';
      } else {
        status = 'degraded';
        detail = `HTTP ${probe.httpCode}`;
      }
      record(mkResult(LIVENESS_CHECK, probe, status, detail));
    }

    // 2. Public surface — chained discovery. Run the discovery chain first.
    const modesProbe = await probePublic(env, '/modes', TIMEOUT_MS);
    const mode = pickField(modesProbe.json, ['modeName', 'mode', 'id', 'name']) || 'tube';
    const modesCount = Array.isArray(modesProbe.json) ? modesProbe.json.length : 0;
    {
      const c = classify200(modesProbe);
      // Empty modes array means the syncer hasn't populated anything.
      if (c.status === 'up' && modesCount === 0) {
        record(mkResult(byId(PUBLIC_CHECKS, 'modes'), modesProbe, 'down', '200 but empty (no data)'));
      } else {
        record(mkResult(byId(PUBLIC_CHECKS, 'modes'), modesProbe, c.status, c.status === 'up' ? `${modesCount} modes · ${modesProbe.latencyMs}ms` : c.detail));
      }
    }

    const linesProbe = await probePublic(env, `/lines/mode/${encodeURIComponent(mode)}`, TIMEOUT_MS);
    const lineId = pickField(linesProbe.json, ['id', 'lineId', 'name']) || 'victoria';
    recordSimple(byId(PUBLIC_CHECKS, 'lines-by-mode'), linesProbe, ` (mode=${mode})`);

    const lineStatusProbe = await probePublic(env, `/lines/status?mode=${encodeURIComponent(mode)}`, TIMEOUT_MS);
    const lineStatusCount = Array.isArray(lineStatusProbe.json) ? lineStatusProbe.json.length : 0;
    recordSimple(byId(PUBLIC_CHECKS, 'line-status'), lineStatusProbe, ` (${lineStatusCount} statuses)`);

    const stationsProbe = await probePublic(env, `/stations/line/${encodeURIComponent(lineId)}`, TIMEOUT_MS);
    const naptanId = pickField(stationsProbe.json, ['naptanId', 'id']);
    recordSimple(byId(PUBLIC_CHECKS, 'stations-by-line'), stationsProbe, ` (line=${lineId})`);

    // Remaining public probes — independent of discovery, run in parallel.
    const [layout, login, register, forgot, about, homeAnn, homeCfg, theme, lineRoute, search, nearby, resolve, subscribedIds] =
      await Promise.all([
        probePublic(env, '/sdui/app/layout', TIMEOUT_MS),
        probePublic(env, '/sdui/app/login', TIMEOUT_MS),
        probePublic(env, '/sdui/app/register', TIMEOUT_MS),
        probePublic(env, '/sdui/app/forgot-password', TIMEOUT_MS),
        probePublic(env, '/sdui/app/about', TIMEOUT_MS),
        probePublic(env, '/sdui/app/home-announcement', TIMEOUT_MS),
        probePublic(env, '/sdui/app/home-config', TIMEOUT_MS),
        probePublic(env, '/sdui/app/theme-tokens', TIMEOUT_MS),
        probePublic(env, `/lines/${encodeURIComponent(lineId)}/route`, TIMEOUT_MS),
        probePublic(env, `/stations/search?searchKey=${encodeURIComponent(SAMPLE_SEARCH)}`, TIMEOUT_MS),
        probePublic(env, `/stations/nearby?lat=${encodeURIComponent(SAMPLE_LAT)}&lon=${encodeURIComponent(SAMPLE_LON)}`, TIMEOUT_MS),
        probePublic(
          env,
          `/stations/resolve?station=${encodeURIComponent(naptanId || lineId)}&mode=${encodeURIComponent(mode)}&line=${encodeURIComponent(lineId)}&direction=inbound`,
          TIMEOUT_MS,
        ),
        probePublic(env, '/stations/subscribed-ids', TIMEOUT_MS),
      ]);

    recordSimple(byId(PUBLIC_CHECKS, 'sdui-layout'), layout);
    recordSimple(byId(PUBLIC_CHECKS, 'sdui-login'), login);
    recordSimple(byId(PUBLIC_CHECKS, 'sdui-register'), register);
    recordSimple(byId(PUBLIC_CHECKS, 'sdui-forgot'), forgot);
    recordSimple(byId(PUBLIC_CHECKS, 'sdui-about'), about);
    recordSimple(byId(PUBLIC_CHECKS, 'sdui-home-announcement'), homeAnn);
    recordSimple(byId(PUBLIC_CHECKS, 'sdui-home-config'), homeCfg);
    recordSimple(byId(PUBLIC_CHECKS, 'sdui-theme-tokens'), theme);
    recordSimple(byId(PUBLIC_CHECKS, 'line-route'), lineRoute, ` (line=${lineId})`);
    recordSimple(byId(PUBLIC_CHECKS, 'stations-search'), search, ` (q=${SAMPLE_SEARCH})`);
    recordSimple(byId(PUBLIC_CHECKS, 'stations-nearby'), nearby);
    recordSimple(byId(PUBLIC_CHECKS, 'stations-resolve'), resolve);
    recordSimple(byId(PUBLIC_CHECKS, 'stations-subscribed-ids'), subscribedIds);

    // predictions needs a real naptanId; skip cleanly if discovery didn't find one.
    if (naptanId) {
      const pred = await probePublic(env, `/stations/predictions/${encodeURIComponent(naptanId)}`, TIMEOUT_MS);
      recordSimple(byId(PUBLIC_CHECKS, 'stations-predictions'), pred, ` (${naptanId})`);
    } else {
      record(mkResult(byId(PUBLIC_CHECKS, 'stations-predictions'), { httpCode: 0, latencyMs: 0 }, 'skipped', 'no naptanId discovered (stations/line empty)'));
    }

    // Website waitlist form target — malformed body should 400 at validation.
    {
      const wl = await probeWaitlistJoin(env, TIMEOUT_MS);
      let status: CheckStatus;
      let detail: string;
      if (wl.httpCode === 400) ({ status, detail } = { status: 'up', detail: `400 validation · ${wl.latencyMs}ms` });
      else if (wl.httpCode === 0) ({ status, detail } = { status: 'down', detail: wl.error ?? 'no response' });
      else if (wl.httpCode >= 500) ({ status, detail } = { status: 'down', detail: `HTTP ${wl.httpCode}` });
      else if (wl.httpCode === 429) ({ status, detail } = { status: 'degraded', detail: '429 rate-limited' });
      else ({ status, detail } = { status: 'degraded', detail: `HTTP ${wl.httpCode} (expected 400)` });
      record(mkResult(byId(PUBLIC_CHECKS, 'waitlist-join'), wl, status, detail));
    }

    // 3. Admin surface.
    const adminAuth = await probeAdminAuth(env, TIMEOUT_MS);
    record(mkResult(byId(ADMIN_CHECKS, 'admin-auth'), adminAuth, ...classifyAdminAuth(adminAuth)));

    const [statsProbe, history, users, waitlist, subscribed] = await Promise.all([
      probeAdminGet(env, '/admin/stats', TIMEOUT_MS),
      probeAdminGet(env, '/admin/notifications/history?limit=1', TIMEOUT_MS),
      probeAdminGet(env, '/admin/users', TIMEOUT_MS),
      probeAdminGet(env, '/admin/waitlist', TIMEOUT_MS),
      probeAdminGet(env, '/admin/subscribed-stations', TIMEOUT_MS),
    ]);
    recordAdmin(byId(ADMIN_CHECKS, 'admin-stats'), statsProbe);
    recordAdmin(byId(ADMIN_CHECKS, 'admin-history'), history);
    recordAdmin(byId(ADMIN_CHECKS, 'admin-users'), users);
    recordAdmin(byId(ADMIN_CHECKS, 'admin-waitlist'), waitlist);
    recordAdmin(byId(ADMIN_CHECKS, 'admin-subscribed'), subscribed);

    // 4. Syncer inference — from modes, line statuses (+ their freshness), and admin stats.
    const newestStatusTs = Array.isArray(lineStatusProbe.json)
      ? lineStatusProbe.json.reduce((mx: number, s: any) => Math.max(mx, Number(s?.lastUpdatedTime) || 0), 0)
      : 0;
    record(inferSyncer({ modesCount, lineStatusCount, newestStatusTs, stats: statsProbe }));

    // 5. User auth-gate probes (parallel).
    await Promise.all(
      USER_CHECKS.map(async (def) => {
        const path = def.path.replace(':uid', 'healthcheck');
        const probe = await probeUserGate(env, def.method === 'GET' ? 'GET' : 'POST', path, TIMEOUT_MS);
        const c = classifyGate(probe);
        record(mkResult(def, probe, c.status, c.detail));
      }),
    );

    // 6. TLS certificate expiry — backend + website hosts.
    await Promise.all([
      recordTls(byId(TLS_CHECKS, 'tls-backend'), hostOf(resolveEnv(env).baseUrl)),
      recordTls(byId(TLS_CHECKS, 'tls-website'), hostOf(websiteUrl(env))),
    ]);

    // 7. Website. If the site is gated by HTTP Basic auth (e.g. staging),
    // WEBSITE_BASIC_AUTH="user:pass" lets the probe authenticate so a healthy
    // gated site reads 200 instead of a 401 we'd otherwise flag as degraded.
    {
      const probe = await probeWebsite(websiteUrl(env), TIMEOUT_MS, websiteAuthHeader(env));
      const c = classify200(probe);
      record(mkResult(WEBSITE_CHECK, probe, c.status, c.detail));
    }

    markCycleComplete();

    // Fire alerts for any state changes recorded this cycle (no-op without a
    // configured webhook). Awaited so it runs before the next cycle, but it is
    // self-contained and never throws.
    await notifyTransitions(env, drainTransitions());
  } finally {
    setRunning(false);
  }
}

// ── small recorders ───────────────────────────────────────────────────

/** Record an "expect 200" public probe, optionally annotating the detail. */
function recordSimple(def: CheckDef, probe: RawProbe, suffix = ''): void {
  const c = classify200(probe);
  record(mkResult(def, probe, c.status, c.detail + suffix));
}

/** Admin GET: expect 200; key/auth issues are degraded, 5xx/no-response down. */
function recordAdmin(def: CheckDef, probe: RawProbe): void {
  let status: CheckStatus;
  let detail: string;
  if (probe.error && probe.httpCode === 0) {
    status = 'down';
    detail = probe.error;
  } else if (probe.httpCode === 200) {
    ({ status, detail } = applySlow({ status: 'up', detail: `200 · ${probe.latencyMs}ms` }, probe.latencyMs));
  } else if (probe.httpCode >= 500 || probe.httpCode === 0) {
    status = 'down';
    detail = `HTTP ${probe.httpCode}`;
  } else if (probe.httpCode === 429) {
    status = 'degraded';
    detail = '429 rate-limited';
  } else if (probe.httpCode === 401 || probe.httpCode === 403 || probe.httpCode === 503) {
    status = 'degraded';
    detail = `HTTP ${probe.httpCode} (admin key/auth)`;
  } else {
    status = 'degraded';
    detail = `HTTP ${probe.httpCode}`;
  }
  record(mkResult(def, probe, status, detail));
}

function classifyAdminAuth(probe: RawProbe): [CheckStatus, string] {
  if (probe.httpCode === 400) return ['up', `key ok (400) · ${probe.latencyMs}ms`];
  if (probe.httpCode === 403) return ['degraded', '403 — admin key mismatch'];
  if (probe.httpCode === 503) return ['down', '503 — backend admin key unset'];
  if (probe.httpCode === 0) return ['down', probe.error ?? 'no response'];
  if (probe.httpCode >= 500) return ['down', `HTTP ${probe.httpCode}`];
  return ['degraded', `HTTP ${probe.httpCode} (expected 400)`];
}

/**
 * Infer syncer health (it has no endpoint). Strong signal = data PRESENCE
 * (empty caches ⇒ the syncer never populated, or the catalogue is gone).
 * Freshness signal = newest line-status `lastUpdatedTime`; because statuses
 * only re-stamp on CHANGE (10-min poll), a quiet network can legitimately be
 * old, so extreme staleness is reported as `degraded`, never `down`.
 */
function inferSyncer(args: {
  modesCount: number;
  lineStatusCount: number;
  newestStatusTs: number;
  stats: RawProbe;
}): CheckResult {
  const { modesCount, lineStatusCount, newestStatusTs, stats } = args;
  const haveStats = stats.httpCode === 200;
  const t = stats.json?.transport ?? {};
  const stations = Number(t.stations) || 0;
  const lines = Number(t.lines) || 0;
  const statuses = Number(t.lineStatuses) || 0;
  const ageMs = newestStatusTs ? Date.now() - newestStatusTs : 0;
  const ageStr = newestStatusTs ? humanAge(ageMs) : 'unknown';

  // Authoritative source is admin /stats (always available with the admin key).
  // The public probe counts (modes / lineStatus) are only a fallback when stats
  // is unavailable — and `0` there can mean "probe skipped (no client key)",
  // NOT "cache empty", so we must not treat a skipped probe as an outage.
  const stationSignal = haveStats ? stations : modesCount;
  const statusSignal = haveStats ? statuses : lineStatusCount;

  let status: CheckStatus;
  let detail: string;

  if (!haveStats && modesCount === 0 && lineStatusCount === 0) {
    status = 'skipped';
    detail = 'no data signal (admin /stats unavailable & no client key)';
  } else if (stationSignal === 0 || statusSignal === 0) {
    status = 'down';
    detail = haveStats
      ? `caches empty (stations=${stations}, lines=${lines}, statuses=${statuses})`
      : `caches empty (modes=${modesCount}, statuses=${lineStatusCount})`;
  } else if (newestStatusTs && ageMs > SYNCER_STALE_MS) {
    status = 'degraded';
    detail = `no status change in ${ageStr} (poller may be down; statuses poll 10m)`;
  } else {
    status = 'up';
    const parts = haveStats
      ? `stations=${stations}, lines=${lines}, statuses=${statuses}`
      : `modes=${modesCount}, statuses=${lineStatusCount}`;
    detail = newestStatusTs ? `${parts}, newest status ${ageStr} ago` : parts;
  }

  return {
    id: SYNCER_CHECK.id,
    group: SYNCER_CHECK.group,
    label: SYNCER_CHECK.label,
    method: SYNCER_CHECK.method,
    path: SYNCER_CHECK.path,
    expected: SYNCER_CHECK.expected,
    status,
    httpCode: 0,
    latencyMs: 0,
    checkedAt: Date.now(),
    detail,
    since: 0,
    fails: 0,
  };
}

/**
 * Basic-auth header for the website probe, if WEBSITE_BASIC_AUTH="user:pass".
 * STAGING ONLY — the staging site is gated by HTTP Basic auth, production is
 * not, so we never attach credentials to a prod request even if the var leaks
 * into a prod env.
 */
function websiteAuthHeader(env: EnvName): Record<string, string> | undefined {
  if (env !== 'staging') return undefined;
  const creds = process.env.WEBSITE_BASIC_AUTH;
  if (!creds || !creds.includes(':')) return undefined;
  return { Authorization: `Basic ${Buffer.from(creds).toString('base64')}` };
}

/** Hostname from a URL, for the TLS probe (returns '' if unparseable). */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function humanAge(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** TLS cert expiry: expired ⇒ down, within warn window ⇒ degraded, else up. */
async function recordTls(def: CheckDef, host: string): Promise<void> {
  if (!host) {
    record(mkResult(def, { httpCode: 0, latencyMs: 0 }, 'skipped', 'no host'));
    return;
  }
  const r = await checkTls(host, 443, TIMEOUT_MS);
  const probe: RawProbe = { httpCode: 0, latencyMs: r.latencyMs };
  let status: CheckStatus;
  let detail: string;
  if (r.error || r.daysLeft == null) {
    status = 'down';
    detail = r.error ?? 'no certificate';
  } else if (r.daysLeft <= 0) {
    status = 'down';
    detail = `EXPIRED (${host})`;
  } else if (r.daysLeft <= TLS_WARN_DAYS) {
    status = 'degraded';
    detail = `expires in ${r.daysLeft}d (${host})`;
  } else {
    status = 'up';
    detail = `valid ${r.daysLeft}d (${host})`;
  }
  record(mkResult(def, probe, status, detail));
}
