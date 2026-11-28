/**
 * Client-side copy of the backend's email shapes
 * (stationly-backend/src/admin/email/emailDoc.ts + emailAudience.ts).
 * The backend validates and renders; keep these two in step.
 */

export type EmailCategory = 'service' | 'marketing';
export type Align = 'left' | 'center';
export type IconName = 'logo' | 'tube' | 'bus' | 'dlr' | 'elizabeth' | 'overground' | 'apple' | 'android';

export type EmailBlock =
  | { id: string; type: 'heading'; text: string; eyebrow?: string; size?: 'xl' | 'lg' | 'md'; align?: Align; accent?: string; oneLine?: boolean }
  | { id: string; type: 'text'; text: string; size?: 'md' | 'sm'; tone?: 'default' | 'muted'; align?: Align }
  | { id: string; type: 'image'; url: string; alt: string; href?: string; width?: number; rounded?: boolean; caption?: string; align?: Align }
  | { id: string; type: 'button'; label: string; url: string; variant?: 'primary' | 'dark' | 'outline'; align?: Align }
  | { id: string; type: 'storeBadges'; ios: boolean; android: boolean; align?: Align; caption?: string }
  | { id: string; type: 'icons'; items: IconName[]; size?: number; align?: Align; caption?: string }
  | { id: string; type: 'quote'; text: string; cite?: string; citeUrl?: string }
  | { id: string; type: 'callout'; text: string; title?: string; tone?: 'info' | 'warning' | 'success' | 'note' }
  | { id: string; type: 'list'; items: string[]; ordered?: boolean }
  | { id: string; type: 'references'; title?: string; items: Array<{ text: string; url?: string }> }
  | { id: string; type: 'signoff'; name: string; role?: string; text?: string; logo?: boolean; url?: string }
  | { id: string; type: 'divider' }
  | { id: string; type: 'spacer'; size?: number };

export type BlockType = EmailBlock['type'];

export interface EmailDoc {
  subject: string;
  preheader?: string;
  fromName: string;
  replyTo?: string;
  category: EmailCategory;
  header: { logo: boolean; accentBars: boolean };
  blocks: EmailBlock[];
}

export type Platform = 'android' | 'ios' | 'web' | 'none';

export interface AudienceFilter {
  source: 'users' | 'waitlist' | 'none';
  platforms?: Platform[];
  appVersion?: { platform: 'android' | 'ios'; op: 'lt' | 'lte' | 'eq' | 'gte' | 'gt'; value: string };
  signedIn?: 'any' | 'yes' | 'no';
  activeWithinDays?: number;
  inactiveForDays?: number;
  joinedAfter?: string;
  joinedBefore?: string;
  boards?: 'any' | 'with' | 'without';
  stations?: string[];
  lines?: string[];
  directions?: string[];
  supporter?: 'any' | 'yes' | 'no';
  emailVerified?: 'any' | 'yes';
  providers?: string[];
  excludeAppleRelay?: boolean;
  customEmails?: string[];
  excludeEmails?: string[];
}

export interface Recipient {
  email: string;
  firstName: string;
  uid?: string;
  displayName?: string;
  source: 'user' | 'waitlist' | 'custom';
  platforms?: string[];
  versions?: Record<string, string>;
  lastSeen?: number;
  joined?: number;
  stations?: string[];
}

export type SendMode = 'direct' | 'broadcast';
export type CampaignStatus = 'draft' | 'sending' | 'sent' | 'partial' | 'failed';

export interface Campaign {
  id: string;
  name: string;
  doc: EmailDoc;
  audience: AudienceFilter;
  status: CampaignStatus;
  mode?: SendMode;
  createdAt: number;
  updatedAt: number;
  sentAt?: number;
  progress?: { phase: string; done: number; total: number } | null;
  result?: {
    total: number; sent: number; failed: number;
    broadcastId?: string; broadcastStatus?: string;
    errors?: Array<{ to?: string; error: string }>;
    segmentSync?: { added: number; removed: number; created: number };
  } | null;
  tests?: Array<{ at: number; to: string[]; ok: number; failed: number }>;
}

export interface CampaignSummary extends Omit<Campaign, 'doc' | 'audience'> {
  subject: string;
  category: EmailCategory;
}

export interface Usage {
  day: string; month: string; usedToday: number; usedThisMonth: number;
  dailyLimit: number; monthlyLimit: number; remainingToday: number; remainingThisMonth: number;
  resetsAt: number; note: string;
}

export interface SendPlan {
  count: number;
  recommended: SendMode | null;
  direct: { allowed: boolean; reason: string; quotaAfter?: number };
  broadcast: { allowed: boolean; reason: string };
  usage: Usage;
}

export interface EmailMeta {
  env: 'staging' | 'production';
  baseUrl: string;
  webUrl: string;
  fromAddress: string;
  usage: Usage;
  limits: { dailyTransactional: number; monthlyTransactional: number; marketingContacts: number; segments: number; requestsPerSecond: number; batchSize: number };
  resend: { configured: boolean; managedSegmentName: string; segmentId: string | null; lastBroadcastId: string | null; lock: { campaignId: string; at: number } | null };
  staging: { allowlist: number } | null;
  counts: { users: number; waitlist: number; optouts: number };
  mergeFields: Array<{ token: string; label: string; note: string; broadcast: boolean }>;
  icons: Array<{ id: IconName; label: string; url: string }>;
  options: {
    stations: Array<{ id: string; name: string; lines: string[]; count: number }>;
    versions: { android: string[]; ios: string[] };
    providers: string[];
  };
}

export interface RenderResult {
  subject: string; preheader: string; from: string; html: string; text: string;
  sizeKb: number; warnings: string[];
  problems: { direct: string[]; broadcast: string[] };
  sample: Recipient | null;
}

export interface AudienceResult {
  count: number;
  recipients: Recipient[];
  truncated: boolean;
  excluded: Array<{ reason: string; count: number }>;
  plan: SendPlan;
}

export interface EmailAsset { id: string; url: string; name: string; mime: string; width: number; height: number; bytes: number; createdAt?: number }

export const uid = () => Math.random().toString(36).slice(2, 10);
