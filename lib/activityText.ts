/**
 * Turns an activity event (`support.purchase` + props) into a sentence a person
 * can read. The names come from the app's ActivityEvents vocabulary
 * (StationlyUI/core/.../activity/ActivityEvent.kt); an unknown event still
 * shows, with its raw name, so nothing new is ever hidden.
 */

export type Tone = 'good' | 'bad' | 'warn' | 'plain';
export type Category = 'app' | 'account' | 'boards' | 'settings' | 'widget' | 'notifications' | 'support' | 'whats_new' | 'other';

export const CATEGORY_LABEL: Record<Category, string> = {
  app: 'App',
  account: 'Account and sync',
  boards: 'Boards',
  settings: 'Settings',
  widget: 'Widgets',
  notifications: 'Notifications',
  support: 'Support',
  whats_new: "What's new",
  other: 'Other',
};

type P = Record<string, unknown>;
const s = (v: unknown) => (v == null || v === '' ? '' : String(v));
const tier = (p: P) => {
  const t = s(p.tier) || s(p.product).split('.').pop() || '';
  const m = t.match(/^t(\d+)$/);
  return m ? `£${m[1]}` : t;
};
const where = (p: P) => (s(p.station) ? ` at ${s(p.station)}` : '');
const secs = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return n < 90 ? `${Math.round(n)}s` : `${Math.round(n / 60)} min`;
};

const FROM: Record<string, string> = { banner: 'the banner', profile: 'Profile', whats_new: "What's new" };
const TRIGGER: Record<string, string> = { on_open: 'on opening the app', board_added: 'after adding a board' };
const PURCHASE: Record<string, [string, Tone]> = {
  purchased: ['Store took the payment', 'good'],
  pending: ['Payment pending at the store', 'warn'],
  cancelled: ['Cancelled at the store', 'plain'],
  unavailable: ['Store unavailable', 'bad'],
  failed: ['Store refused the payment', 'bad'],
  already_owned: ['Store said already owned', 'warn'],
};

export function categoryOf(name: string): Category {
  const head = name.split('.')[0];
  if (head === 'app') return 'app';
  if (head === 'auth' || head === 'sync') return 'account';
  if (head === 'board') return 'boards';
  if (head === 'settings') return 'settings';
  if (head === 'widget') return 'widget';
  if (head === 'notification') return 'notifications';
  if (head === 'support') return 'support';
  if (head === 'whats_new') return 'whats_new';
  return 'other';
}

export function describe(name: string, p: P = {}): { text: string; tone: Tone } {
  switch (name) {
    case 'app.opened': return { text: p.cold === 'true' ? 'Opened the app' : 'Came back to the app', tone: 'plain' };
    case 'app.backgrounded': return { text: `Left the app${p.seconds ? ` after ${secs(p.seconds)}` : ''}`, tone: 'plain' };
    case 'app.upgrade_required': return { text: `Blocked: update required (has ${s(p.installed) || '?'}, needs ${s(p.min) || '?'})`, tone: 'bad' };
    case 'app.update_nudged': return { text: `Asked to update to ${s(p.to)}`, tone: 'plain' };

    case 'auth.logged_in': return { text: `Signed in${p.provider ? ` with ${s(p.provider)}` : ''}`, tone: 'good' };
    case 'auth.logged_out': return { text: 'Signed out', tone: 'plain' };
    case 'auth.account_deleted': return { text: 'Deleted their account', tone: 'bad' };
    case 'auth.forced_logout': return { text: `Signed out by the app (${s(p.status)} on ${s(p.path)})${p.account_gone === 'false' ? ', server never said the account was gone' : ''}`, tone: 'bad' };
    case 'auth.401_survived': return { text: `Kept signed in after a 401 on ${s(p.path)}`, tone: 'warn' };
    case 'sync.reconciled': return { text: `Synced from another device${p.reason ? ` (${s(p.reason)})` : ''}`, tone: 'plain' };
    case 'sync.failed': return { text: `Sync failed at ${s(p.stage)}${p.reason ? `: ${s(p.reason)}` : ''}`, tone: 'bad' };
    case 'sync.restored': return { text: `Restored ${s(p.boards)} boards from the account`, tone: 'good' };
    case 'sync.over_limit': return { text: 'Had more boards than the station limit allows', tone: 'warn' };

    case 'board.added': return { text: `Added a board${where(p)}${p.line ? ` (${s(p.line)})` : ''}`, tone: 'plain' };
    case 'board.deleted': return { text: `Removed a board${where(p)}`, tone: 'plain' };
    case 'board.filtered': return { text: `Filtered a board${where(p)} to ${s(p.filter).toLowerCase()}${p.count ? ` (${s(p.count)})` : ''}`, tone: 'plain' };

    case 'settings.home_layout': return { text: `Switched home to ${s(p.layout).toLowerCase()} view`, tone: 'plain' };
    case 'settings.home_reordered': return { text: `Reordered home (${s(p.count)} stations)`, tone: 'plain' };
    case 'settings.station_changed': return { text: `Changed ${s(p.key)} to ${s(p.value)}${where(p)}`, tone: 'plain' };
    case 'settings.dream_changed': return { text: `Screensaver: ${s(p.key)} set to ${s(p.value)}`, tone: 'plain' };

    case 'widget.added': return { text: `Added a widget${p.family ? ` (${s(p.family)})` : ''}${where(p)}`, tone: 'good' };
    case 'widget.removed': return { text: `Removed a widget${where(p)}`, tone: 'plain' };
    case 'widget.count': return { text: `Now has ${s(p.count)} widgets`, tone: 'plain' };
    case 'widget.guide_opened': return { text: 'Opened the widget guide', tone: 'plain' };

    case 'notification.posted': return { text: `Shown a ${s(p.type).replace(/_/g, ' ') || 'notification'}${p.line ? ` (${s(p.line)})` : ''}`, tone: 'plain' };
    case 'notification.opened': return { text: `Opened a notification${p.line ? ` (${s(p.line)})` : ''}`, tone: 'good' };
    case 'notification.suppressed': return { text: `Notification held back: ${s(p.reason).replace(/_/g, ' ')}${p.line ? ` (${s(p.line)})` : ''}`, tone: 'plain' };
    case 'notification.muted': return { text: `Muted ${s(p.type).replace(/_/g, ' ') || 'notifications'}${p.line ? ` (${s(p.line)})` : ''}`, tone: 'warn' };

    case 'support.asked': return { text: `Asked for support ${TRIGGER[s(p.trigger)] ?? s(p.trigger)}`.trim(), tone: 'plain' };
    case 'support.ask_dismissed': return { text: 'Said "Maybe later" to the support ask', tone: 'plain' };
    case 'support.sheet_opened': return { text: `Opened the support amounts from ${FROM[s(p.from)] ?? s(p.from)}`, tone: 'plain' };
    case 'support.sheet_closed': return { text: 'Closed the support amounts without paying', tone: 'plain' };
    case 'support.tier_tapped': return { text: `Tapped ${tier(p)}${p.started === 'false' ? ', but the store sheet did not open' : ''}`, tone: p.started === 'false' ? 'bad' : 'plain' };
    case 'support.purchase': {
      const [t, tone] = PURCHASE[s(p.result)] ?? [`Store said ${s(p.result)}`, 'plain' as Tone];
      return { text: `${t}${tier(p) ? ` (${tier(p)})` : ''}${p.code ? `, code ${s(p.code)}` : ''}`, tone };
    }
    case 'support.verified': {
      const o = s(p.outcome);
      if (o === 'credited' || o === 'ok' || o === 'recorded') return { text: `Our server credited the payment (${tier(p)})`, tone: 'good' };
      if (o === 'already_credited') return { text: 'Our server had already credited this payment', tone: 'plain' };
      if (o.startsWith('retry')) return { text: `Our server could not credit it yet, the app will retry (${o.slice(6) || 'network'})`, tone: 'warn' };
      if (o.startsWith('rejected')) return { text: `Our server rejected the payment (${o.slice(9).replace(/_/g, ' ')})`, tone: 'bad' };
      return { text: `Our server said ${o.replace(/_/g, ' ')}`, tone: 'warn' };
    }
    case 'support.thanks_shown': return { text: `Saw the thank-you${tier(p) ? ` (${tier(p)})` : ''}`, tone: 'good' };

    case 'whats_new.shown': return { text: "Saw the What's new screen", tone: 'plain' };
    case 'whats_new.dismissed': return { text: `Closed What's new${p.via === 'back' ? ' with Back' : ''}`, tone: 'plain' };
    case 'whats_new.support_tapped': return { text: "Tapped Support on What's new", tone: 'good' };
  }
  const extra = Object.entries(p).map(([k, v]) => `${k} ${s(v)}`).join(', ');
  return { text: `${name}${extra ? ` (${extra})` : ''}`, tone: 'plain' };
}

/** Plain-English label for an event name, for tables and funnels. */
export function eventLabel(name: string): string {
  const LABELS: Record<string, string> = {
    'app.opened': 'Opened the app', 'app.backgrounded': 'Left the app', 'app.upgrade_required': 'Blocked by update gate',
    'app.update_nudged': 'Asked to update', 'auth.logged_in': 'Signed in', 'auth.logged_out': 'Signed out',
    'auth.account_deleted': 'Deleted account', 'auth.forced_logout': 'Signed out by the app', 'auth.401_survived': 'Survived a 401',
    'sync.reconciled': 'Synced from another device', 'sync.failed': 'Sync failed', 'sync.restored': 'Boards restored',
    'sync.over_limit': 'Over the station limit', 'board.added': 'Added a board', 'board.deleted': 'Removed a board',
    'board.filtered': 'Filtered a board', 'settings.home_layout': 'Changed home layout', 'settings.home_reordered': 'Reordered home',
    'settings.station_changed': 'Changed a station setting', 'settings.dream_changed': 'Changed screensaver',
    'widget.added': 'Added a widget', 'widget.removed': 'Removed a widget', 'widget.count': 'Widget count changed',
    'widget.guide_opened': 'Opened widget guide', 'notification.posted': 'Notification shown', 'notification.opened': 'Notification opened',
    'notification.suppressed': 'Notification held back', 'notification.muted': 'Muted notifications',
    'support.asked': 'Asked for support', 'support.ask_dismissed': 'Said maybe later', 'support.sheet_opened': 'Opened support amounts',
    'support.sheet_closed': 'Closed support amounts', 'support.tier_tapped': 'Tapped an amount', 'support.purchase': 'Store result',
    'support.verified': 'Server credit result', 'support.thanks_shown': 'Saw the thank-you', 'whats_new.shown': "Saw What's new",
    'whats_new.dismissed': "Closed What's new", 'whats_new.support_tapped': "Tapped Support on What's new",
  };
  return LABELS[name] ?? name;
}
