/**
 * In-memory store for health-check results. A bounded ring buffer per check id
 * (default 288 = 24h at one cycle / 5 min) gives uptime % + a status strip with
 * no database dependency. State lives on a globalThis singleton so it survives
 * Next's dev HMR and is shared between the scheduler and the API route within
 * the single container.
 *
 * History resets on process restart — acceptable for an at-a-glance ops view;
 * SQLite persistence is a noted future upgrade.
 */
import { ALL_CHECKS, GROUP_LABEL } from './registry';
import type {
  CheckGroup,
  CheckResult,
  CheckStatus,
  HealthSnapshot,
  HistoryPoint,
  ServiceRollup,
  Transition,
} from './types';

const HISTORY_SIZE = (() => {
  const n = Number(process.env.HEALTHCHECK_HISTORY);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 288;
})();

const INTERVAL_MS = (() => {
  const n = Number(process.env.HEALTHCHECK_INTERVAL_MS);
  return Number.isFinite(n) && n >= 10_000 ? Math.floor(n) : 300_000;
})();

interface HealthState {
  /** Latest result per check id. */
  latest: Map<string, CheckResult>;
  /** Ring-buffer history per check id (oldest → newest). */
  history: Map<string, HistoryPoint[]>;
  /** Status changes since the last drain — consumed by the alerter. */
  transitions: Transition[];
  lastCycleAt: number;
  running: boolean;
}

declare global {
  // eslint-disable-next-line no-var
  var __stationlyHealthState: HealthState | undefined;
}

function state(): HealthState {
  if (!globalThis.__stationlyHealthState) {
    globalThis.__stationlyHealthState = {
      latest: new Map(),
      history: new Map(),
      transitions: [],
      lastCycleAt: 0,
      running: false,
    };
  }
  return globalThis.__stationlyHealthState;
}

/** Record one probe result — updates "latest" and appends to the ring buffer.
 * Derives `since` (when the current status began) and `fails` (consecutive
 * non-up cycles) from the previous result so the UI can show incident age. */
export function record(result: CheckResult): void {
  const s = state();
  const prev = s.latest.get(result.id);
  if (prev && prev.status === result.status) {
    result.since = prev.since || result.checkedAt;
  } else {
    result.since = result.checkedAt; // status just changed (or first ever)
    // Emit a transition only when moving BETWEEN known states (not on the
    // first-ever result), so a fresh process doesn't alert-storm on boot.
    if (prev) {
      s.transitions.push({
        id: result.id,
        label: result.label,
        group: result.group,
        from: prev.status,
        to: result.status,
        detail: result.detail,
        at: result.checkedAt,
      });
    }
  }
  const isFail = result.status === 'down' || result.status === 'degraded';
  result.fails = isFail ? (prev?.fails ?? 0) + 1 : 0;
  s.latest.set(result.id, result);
  const hist = s.history.get(result.id) ?? [];
  hist.push({
    status: result.status,
    httpCode: result.httpCode,
    latencyMs: result.latencyMs,
    checkedAt: result.checkedAt,
  });
  if (hist.length > HISTORY_SIZE) hist.splice(0, hist.length - HISTORY_SIZE);
  s.history.set(result.id, hist);
}

export function setRunning(running: boolean): void {
  state().running = running;
}

/** Return and clear the transitions accumulated since the last drain. */
export function drainTransitions(): Transition[] {
  const s = state();
  const out = s.transitions;
  s.transitions = [];
  return out;
}

export function markCycleComplete(at = Date.now()): void {
  state().lastCycleAt = at;
}

/**
 * Worst-of ordering: down > degraded > up > skipped. `skipped` is the LOWEST so
 * it never masks real health — a group/overall with some measured `up` checks
 * and some `skipped` ones reads `up`, while a group where EVERYTHING is skipped
 * (e.g. the app surface with no client key) correctly reads `skipped`.
 */
const SEVERITY: Record<CheckStatus, number> = { down: 3, degraded: 2, up: 1, skipped: 0 };

function worst(statuses: CheckStatus[]): CheckStatus {
  if (statuses.length === 0) return 'skipped';
  return statuses.reduce((acc, s) => (SEVERITY[s] > SEVERITY[acc] ? s : acc), 'skipped' as CheckStatus);
}

/** Build the snapshot the API ships to the client. */
export function getSnapshot(): HealthSnapshot {
  const s = state();

  // Latest results in registry order (omit checks never run yet).
  const checks: CheckResult[] = ALL_CHECKS.map((d) => s.latest.get(d.id)).filter(
    (r): r is CheckResult => Boolean(r),
  );

  // Per-group rollups from the latest results.
  const groups = new Map<CheckGroup, CheckResult[]>();
  for (const r of checks) {
    const arr = groups.get(r.group) ?? [];
    arr.push(r);
    groups.set(r.group, arr);
  }
  const rollups: ServiceRollup[] = [];
  for (const [group, arr] of groups) {
    const count = (st: CheckStatus) => arr.filter((r) => r.status === st).length;
    rollups.push({
      group,
      label: GROUP_LABEL[group],
      status: worst(arr.map((r) => r.status)),
      up: count('up'),
      degraded: count('degraded'),
      down: count('down'),
      skipped: count('skipped'),
      total: arr.length,
    });
  }

  // History + uptime % (a check counts as "up" for uptime when not down/skipped).
  const history: Record<string, HistoryPoint[]> = {};
  const uptime: Record<string, number> = {};
  for (const [id, points] of s.history) {
    history[id] = points;
    // Uptime is measured over actually-probed cycles; a check that has only ever
    // been skipped has no uptime to report (left out ⇒ the UI shows "—").
    const considered = points.filter((p) => p.status !== 'skipped');
    if (considered.length === 0) continue;
    const upCount = considered.filter((p) => p.status === 'up' || p.status === 'degraded').length;
    uptime[id] = Math.round((upCount / considered.length) * 1000) / 10;
  }

  return {
    lastCycleAt: s.lastCycleAt,
    running: s.running,
    intervalMs: INTERVAL_MS,
    overall: worst(checks.map((r) => r.status)),
    rollups,
    checks,
    history,
    uptime,
  };
}

export const HEALTH_INTERVAL_MS = INTERVAL_MS;
