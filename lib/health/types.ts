/**
 * Shared types for the health-check dashboard. Imported by both the server
 * (scheduler + probes) and the client (HealthDashboard), so this file must stay
 * free of any server-only imports or secrets.
 */

/** Outcome of a single endpoint probe. */
export type CheckStatus =
  | 'up' // responded as expected
  | 'degraded' // reachable but not fully healthy (e.g. key mismatch, stale data)
  | 'down' // timeout, 5xx, or an unexpected status — the app would be blocked
  | 'skipped'; // not probed (e.g. missing credential, or deliberately skipped)

/** Logical grouping of checks in the UI + rollups. */
export type CheckGroup =
  | 'liveness'
  | 'public' // app-facing /api/v1/* surface (X-Stationly-Key)
  | 'user' // user-auth-gated routes, probed at the auth gate (expect 401)
  | 'admin' // /api/v1/admin/* surface
  | 'syncer' // inferred from data freshness (no endpoint of its own)
  | 'tls' // TLS certificate expiry for the backend + website hosts
  | 'website'; // the public StationUI website

export interface CheckGroupMeta {
  group: CheckGroup;
  label: string;
  /** One-line description shown under the group heading. */
  blurb: string;
}

/** A static definition of something we probe — the registry entry. */
export interface CheckDef {
  id: string;
  group: CheckGroup;
  label: string;
  method: 'GET' | 'POST' | 'INFER';
  /** Path template as the app calls it (params resolved at runtime). */
  path: string;
  /** Human-readable expected outcome, e.g. "200", "401 (auth gate)". */
  expected: string;
}

/** The result of running one CheckDef during a cycle. */
export interface CheckResult {
  id: string;
  group: CheckGroup;
  label: string;
  method: 'GET' | 'POST' | 'INFER';
  path: string;
  expected: string;
  status: CheckStatus;
  /** Actual HTTP code, or 0 when the request never completed (timeout/network). */
  httpCode: number;
  latencyMs: number;
  checkedAt: number;
  /** Short human note: what was actually resolved, or the error. */
  detail: string;
  /** When the current status first began (for "down for 15m"). */
  since: number;
  /** Consecutive cycles in a non-`up` state (0 when up). */
  fails: number;
  /** Optional rich payload for the detail modal (e.g. the Syncer's full
   * /sync-status JSON). Only set on checks that carry extra structured data. */
  data?: Record<string, unknown>;
}

/** Per-group rollup derived from the latest results in that group. */
export interface ServiceRollup {
  group: CheckGroup;
  label: string;
  status: CheckStatus; // worst-of the group's latest results
  up: number;
  degraded: number;
  down: number;
  skipped: number;
  total: number;
}

/** What `getSnapshot()` returns and the API ships to the client. */
export interface HealthSnapshot {
  /** When the most recent cycle finished (0 if none yet). */
  lastCycleAt: number;
  /** Whether a cycle is currently running. */
  running: boolean;
  /** Configured interval between cycles (ms). */
  intervalMs: number;
  /** Overall worst-of status across all groups. */
  overall: CheckStatus;
  rollups: ServiceRollup[];
  /** Latest result per check, in registry order. */
  checks: CheckResult[];
  /**
   * Recent history per check id (oldest → newest), each entry a compact
   * {status, httpCode, latencyMs, checkedAt} for the uptime strip + uptime %.
   */
  history: Record<string, HistoryPoint[]>;
  /** Uptime % over the retained history window, per check id. */
  uptime: Record<string, number>;
}

export interface HistoryPoint {
  status: CheckStatus;
  httpCode: number;
  latencyMs: number;
  checkedAt: number;
}

/** A status change for one check — emitted to the alerter. */
export interface Transition {
  id: string;
  label: string;
  group: CheckGroup;
  from: CheckStatus;
  to: CheckStatus;
  detail: string;
  at: number;
}

/** Human labels per status — shared by the dashboard + detail modal so they
 * can't drift. (A small runtime const, co-located with CheckStatus by design.) */
export const STATUS_LABEL: Record<CheckStatus, string> = {
  up: 'Operational',
  degraded: 'Degraded',
  down: 'Down',
  skipped: 'Not checked',
};
