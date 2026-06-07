/**
 * Health alerting. When a check changes state, post a message to a webhook
 * (Slack / Discord / Mattermost / generic JSON `{text}`) so ops hears about an
 * outage without watching the dashboard.
 *
 * Configured by env (so prod and staging can point at different channels):
 *   HEALTH_ALERT_WEBHOOK     — the incoming-webhook URL (alerting off if unset)
 *   HEALTH_ALERT_ON_DEGRADED — "1" to also alert on degraded (default: down only)
 *
 * By default we alert on entering `down` and on recovery FROM `down`; degraded
 * flaps are muted unless opted in, to keep the channel quiet.
 */
import 'server-only';
import type { EnvName } from '../env';
import type { Transition } from './types';

const EMOJI: Record<string, string> = { down: '🔴', degraded: '🟠', up: '🟢', skipped: '⚪️' };

function isAlertable(t: Transition, onDegraded: boolean): boolean {
  if (t.to === 'down' || t.from === 'down') return true; // outage or recovery
  if (onDegraded && (t.to === 'degraded' || t.from === 'degraded')) return true;
  return false;
}

function lineFor(t: Transition): string {
  const recovered = t.from === 'down' && (t.to === 'up' || t.to === 'degraded');
  const verb = recovered ? 'recovered' : t.to.toUpperCase();
  return `${EMOJI[t.to] ?? '•'} *${t.label}* ${verb} (${t.from} → ${t.to}) — ${t.detail}`;
}

export async function notifyTransitions(env: EnvName, transitions: Transition[]): Promise<void> {
  const url = process.env.HEALTH_ALERT_WEBHOOK;
  if (!url) return;
  const onDegraded = process.env.HEALTH_ALERT_ON_DEGRADED === '1';
  const alertable = transitions.filter((t) => isAlertable(t, onDegraded));
  if (alertable.length === 0) return;

  const header = `*Stationly health (${env})* — ${alertable.length} change${alertable.length > 1 ? 's' : ''}`;
  const text = [header, ...alertable.map(lineFor)].join('\n');

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
    console.log(`[health] alerted ${alertable.length} transition(s) to webhook`);
  } catch (e: any) {
    console.error('[health] alert webhook failed:', e?.message ?? e);
  }
}
