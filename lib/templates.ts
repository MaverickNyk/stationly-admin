/**
 * Notification presets — one-click fills for the composer. Each template sets
 * the content fields (type / severity / style / title / body / subtitle);
 * merged over the current payload so the admin then edits the specifics and
 * picks the audience. The bodies use a “…” placeholder where details go.
 *
 * Keep these aligned with the payload `type`/`severity` enums in payload.ts.
 */
import type { NotificationPayload } from './payload';

export interface NotificationTemplate {
  id: string;
  label: string;
  /** Tooltip — when to reach for it. */
  hint: string;
  payload: Partial<NotificationPayload>;
}

export const TEMPLATES: NotificationTemplate[] = [
  {
    id: 'severe-delays',
    label: 'Severe delays',
    hint: 'Major disruption on a line — pair with a “line” audience',
    payload: {
      type: 'line_status_change',
      severity: 'danger',
      style: 'bigText',
      title: 'Severe delays',
      body: 'Severe delays due to … — check before you travel.',
    },
  },
  {
    id: 'minor-delays',
    label: 'Minor delays',
    hint: 'Minor disruption — allow extra time',
    payload: {
      type: 'line_status_change',
      severity: 'warning',
      title: 'Minor delays',
      body: 'Minor delays on the line — allow extra time for your journey.',
    },
  },
  {
    id: 'good-service',
    label: 'Good service restored',
    hint: 'All-clear after a disruption',
    payload: {
      type: 'line_status_change',
      severity: 'success',
      title: 'Good service resumed',
      body: 'Good service has resumed. Thanks for your patience.',
    },
  },
  {
    id: 'planned-closure',
    label: 'Planned closure',
    hint: 'Engineering works / weekend closure',
    payload: {
      type: 'announcement',
      severity: 'warning',
      style: 'bigText',
      title: 'Planned closure',
      body: 'Part of the line will be closed … for engineering work. Plan ahead.',
    },
  },
  {
    id: 'promo',
    label: 'Promo',
    hint: 'Marketing / feature announcement',
    payload: {
      type: 'promo',
      severity: 'info',
      title: '',
      body: '',
    },
  },
  {
    id: 'system',
    label: 'System notice',
    hint: 'Neutral operational/system message',
    payload: {
      type: 'system',
      severity: 'neutral',
      title: '',
      body: '',
    },
  },
];
