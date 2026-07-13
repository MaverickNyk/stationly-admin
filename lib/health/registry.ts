/**
 * The static registry of everything the health dashboard probes. This is the
 * single source of truth shared by the cycle runner (lib/health/checks.ts) and
 * the UI (components/HealthDashboard.tsx) so the two never drift.
 *
 * Paths mirror the real app contract:
 *   - StationlyUI/core/.../service/SduiApiService.kt
 *   - StationlyUI/core/.../service/TflApiService.kt
 *   - stationly-backend/src/routes/apiRoutes.ts + src/admin/adminRoutes.ts
 *
 * No secrets, no server-only imports — safe to import on the client.
 */
import type { CheckDef, CheckGroup, CheckGroupMeta } from './types';

export const GROUP_META: CheckGroupMeta[] = [
  { group: 'liveness', label: 'Liveness', blurb: 'Backend process is up and answering.' },
  { group: 'public', label: 'App endpoints', blurb: 'The /api/v1/* surface the app calls — probed with the client key, exactly as the app does.' },
  { group: 'user', label: 'User-gated', blurb: "Auth-gated /user/* routes, probed at the auth gate (expect 401 = route alive, no side effects)." },
  { group: 'admin', label: 'Admin API', blurb: 'The /api/v1/admin/* surface this console uses.' },
  { group: 'syncer', label: 'Syncer', blurb: "Probed directly via the Syncer's /sync-status endpoint (set SYNCER_URL); falls back to inferring from backend data freshness when that's unset/unreachable. Click the row for the last-run breakdown." },
  { group: 'tls', label: 'TLS certs', blurb: 'Certificate expiry for the backend + website hosts — an expired cert silently blocks the app.' },
  { group: 'website', label: 'Website', blurb: 'The public StationUI website.' },
];

export const GROUP_LABEL: Record<CheckGroup, string> = Object.fromEntries(
  GROUP_META.map((g) => [g.group, g.label]),
) as Record<CheckGroup, string>;

/**
 * Public app-facing endpoints. `path` may contain `:param` placeholders or
 * `?query` markers that checks.ts fills from chained discovery / config. The
 * order matters: discovery endpoints (`modes`, `lines-by-mode`, `stations-by-line`)
 * run first so later probes can reuse their results.
 */
export const PUBLIC_CHECKS: CheckDef[] = [
  { id: 'sdui-layout', group: 'public', label: 'SDUI selection layout', method: 'GET', path: '/sdui/app/layout', expected: '200' },
  { id: 'sdui-login', group: 'public', label: 'SDUI login layout', method: 'GET', path: '/sdui/app/login', expected: '200' },
  { id: 'sdui-register', group: 'public', label: 'SDUI register layout', method: 'GET', path: '/sdui/app/register', expected: '200' },
  { id: 'sdui-forgot', group: 'public', label: 'SDUI forgot-password layout', method: 'GET', path: '/sdui/app/forgot-password', expected: '200' },
  { id: 'sdui-about', group: 'public', label: 'SDUI about layout', method: 'GET', path: '/sdui/app/about', expected: '200' },
  { id: 'sdui-home-announcement', group: 'public', label: 'SDUI home announcement', method: 'GET', path: '/sdui/app/home-announcement', expected: '200' },
  { id: 'sdui-home-config', group: 'public', label: 'SDUI home config', method: 'GET', path: '/sdui/app/home-config', expected: '200' },
  { id: 'sdui-theme-tokens', group: 'public', label: 'SDUI theme tokens', method: 'GET', path: '/sdui/app/theme-tokens', expected: '200' },
  { id: 'modes', group: 'public', label: 'Modes', method: 'GET', path: '/modes', expected: '200 + non-empty' },
  { id: 'lines-by-mode', group: 'public', label: 'Lines by mode', method: 'GET', path: '/lines/mode/:mode', expected: '200' },
  { id: 'line-status', group: 'public', label: 'Line statuses', method: 'GET', path: '/lines/status', expected: '200' },
  { id: 'line-route', group: 'public', label: 'Line route', method: 'GET', path: '/lines/:lineId/route', expected: '200' },
  { id: 'stations-by-line', group: 'public', label: 'Stations by line', method: 'GET', path: '/stations/line/:lineId', expected: '200' },
  { id: 'stations-search', group: 'public', label: 'Station search', method: 'GET', path: '/stations/search?searchKey=', expected: '200' },
  { id: 'stations-nearby', group: 'public', label: 'Nearby stations', method: 'GET', path: '/stations/nearby?lat=&lon=', expected: '200' },
  { id: 'stations-resolve', group: 'public', label: 'Resolve station', method: 'GET', path: '/stations/resolve', expected: '200' },
  { id: 'stations-predictions', group: 'public', label: 'Station predictions', method: 'GET', path: '/stations/predictions/:naptanId', expected: '200' },
  { id: 'stations-subscribed-ids', group: 'public', label: 'Subscribed station ids', method: 'GET', path: '/stations/subscribed-ids', expected: '200' },
  // Website waitlist form target — no key, mounted ahead of the key middleware.
  // Probed with a malformed body so it 400s at validation (no row created).
  { id: 'waitlist-join', group: 'public', label: 'Waitlist join (form)', method: 'POST', path: '/waitlist/join', expected: '400 (validation)' },
];

/**
 * User-auth-gated routes. We send the client key but NO Firebase bearer, so the
 * auth middleware rejects with 401 BEFORE the handler — proving the route is
 * mounted and not 5xx-ing, with zero side effects. `method` is the app's verb.
 */
export const USER_CHECKS: CheckDef[] = [
  { id: 'user-get-profile', group: 'user', label: 'Get profile', method: 'GET', path: '/user/sync/profile', expected: '401 (gate)' },
  { id: 'user-sync-profile', group: 'user', label: 'Sync profile', method: 'POST', path: '/user/sync/profile', expected: '401 (gate)' },
  { id: 'user-sync-stations', group: 'user', label: 'Sync stations', method: 'POST', path: '/user/sync/stations', expected: '401 (gate)' },
  { id: 'user-station-add', group: 'user', label: 'Add station', method: 'POST', path: '/user/stations/add', expected: '401 (gate)' },
  { id: 'user-station-delete', group: 'user', label: 'Delete station', method: 'POST', path: '/user/stations/delete', expected: '401 (gate)' },
  { id: 'user-logout', group: 'user', label: 'Logout', method: 'POST', path: '/user/logout', expected: '401 (gate)' },
  { id: 'user-delete-account', group: 'user', label: 'Delete account', method: 'POST', path: '/user/delete-account', expected: '401 (gate)' },
  { id: 'user-fcm-register', group: 'user', label: 'Register FCM token', method: 'POST', path: '/user/fcm/register', expected: '401 (gate)' },
  { id: 'user-fcm-unregister', group: 'user', label: 'Unregister FCM token', method: 'POST', path: '/user/fcm/unregister', expected: '401 (gate)' },
  { id: 'user-send-verification', group: 'user', label: 'Send verification email', method: 'POST', path: '/user/send-verification-email', expected: '401 (gate)' },
  { id: 'sdui-profile', group: 'user', label: 'SDUI profile', method: 'GET', path: '/sdui/app/profile/:uid', expected: '401 (gate)' },
];

/** Admin endpoints (proxied with the admin bearer key). */
export const ADMIN_CHECKS: CheckDef[] = [
  { id: 'admin-auth', group: 'admin', label: 'Admin auth + send pipeline', method: 'POST', path: '/admin/notifications/send', expected: '400 (key ok)' },
  { id: 'admin-stats', group: 'admin', label: 'Admin stats', method: 'GET', path: '/admin/stats', expected: '200' },
  { id: 'admin-history', group: 'admin', label: 'Notification history', method: 'GET', path: '/admin/notifications/history?limit=1', expected: '200' },
  { id: 'admin-users', group: 'admin', label: 'Users', method: 'GET', path: '/admin/users', expected: '200' },
  { id: 'admin-waitlist', group: 'admin', label: 'Waitlist', method: 'GET', path: '/admin/waitlist', expected: '200' },
  { id: 'admin-subscribed', group: 'admin', label: 'Subscribed stations', method: 'GET', path: '/admin/subscribed-stations', expected: '200' },
];

export const LIVENESS_CHECK: CheckDef = {
  id: 'root',
  group: 'liveness',
  label: 'Backend root',
  method: 'GET',
  path: '/',
  expected: '200 + Online',
};

export const SYNCER_CHECK: CheckDef = {
  id: 'syncer',
  group: 'syncer',
  label: 'Syncer status',
  // Defaults describe the INFERENCE fallback; a live /sync-status probe overrides
  // method/path/expected on the result (see checks.ts :: mapSyncerProbe).
  method: 'INFER',
  path: '(inferred from /modes, /lines/status, /admin/stats)',
  expected: 'caches populated & fresh',
};

export const TLS_CHECKS: CheckDef[] = [
  { id: 'tls-backend', group: 'tls', label: 'Backend certificate', method: 'INFER', path: '(BACKEND_URL host :443)', expected: 'valid & not near expiry' },
  { id: 'tls-website', group: 'tls', label: 'Website certificate', method: 'INFER', path: '(WEBSITE_URL host :443)', expected: 'valid & not near expiry' },
];

export const WEBSITE_CHECK: CheckDef = {
  id: 'website',
  group: 'website',
  label: 'StationUI website',
  method: 'GET',
  path: '(WEBSITE_URL)',
  expected: '200',
};

/** Every check in display order — the canonical ordering for the UI. */
export const ALL_CHECKS: CheckDef[] = [
  LIVENESS_CHECK,
  ...PUBLIC_CHECKS,
  SYNCER_CHECK,
  ...USER_CHECKS,
  ...ADMIN_CHECKS,
  ...TLS_CHECKS,
  WEBSITE_CHECK,
];
