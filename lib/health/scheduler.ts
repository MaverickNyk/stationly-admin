/**
 * The background scheduler. Satisfies the "checked at least every 5 minutes,
 * continuously" requirement: a single setInterval, started on server boot from
 * instrumentation.ts, runs the health cycle for the life of the container —
 * independent of whether any browser tab is open.
 *
 * The timer handle lives on globalThis so Next's dev HMR (which re-evaluates
 * modules) never spawns duplicate intervals, and so the API route can lazily
 * ensure it's running as a belt-and-braces fallback.
 */
import 'server-only';
import { activeEnv } from '../env';
import { runHealthCycle } from './checks';
import { HEALTH_INTERVAL_MS } from './store';

declare global {
  // eslint-disable-next-line no-var
  var __stationlyHealthTimer: ReturnType<typeof setInterval> | undefined;
}

async function safeCycle(): Promise<void> {
  try {
    await runHealthCycle(activeEnv());
    console.log(`[health] cycle complete (${activeEnv()})`);
  } catch (e: any) {
    // runHealthCycle is already defensive; this is a last-resort guard so a
    // bug can never kill the interval.
    console.error('[health] cycle failed:', e?.message ?? e);
  }
}

/** Start the recurring health cycle exactly once. Safe to call repeatedly. */
export function ensureScheduler(): void {
  if (globalThis.__stationlyHealthTimer) return;
  console.log(`[health] starting scheduler — every ${Math.round(HEALTH_INTERVAL_MS / 1000)}s`);
  // Run one cycle immediately so the dashboard has data on first load.
  void safeCycle();
  const timer = setInterval(safeCycle, HEALTH_INTERVAL_MS);
  // Don't keep the event loop alive solely for this timer.
  if (typeof timer.unref === 'function') timer.unref();
  globalThis.__stationlyHealthTimer = timer;
}

/** Run a single cycle on demand (the "Run check now" button). */
export async function runOnce(): Promise<void> {
  await safeCycle();
}
