/**
 * Target-environment config — mirrors StationlyUI's `AppConfig.kt`
 * (PROD_API_URL / STAGING_API_URL). The console targets exactly ONE
 * environment, fixed by the deployment (never chosen in the UI): staging or
 * production. There is no "local" environment — local development simply runs
 * the console with `STATIONLY_ENV=staging` so it points at staging.
 *
 * Each env has its own admin key + Cloudflare service token, resolved here
 * server-side and never shipped to the browser.
 */

export type EnvName = 'staging' | 'prod';

export interface EnvMeta {
  name: EnvName;
  label: string;
  /** Visual accent. prod is deliberately alarming. */
  tone: 'staging' | 'prod';
}

export const ENV_META: Record<EnvName, EnvMeta> = {
  staging: { name: 'staging', label: 'Staging', tone: 'staging' },
  prod: { name: 'prod', label: 'Production', tone: 'prod' },
};

/**
 * The SINGLE environment this console deployment targets — determined by the
 * server, NOT chosen in the UI. Set `STATIONLY_ENV` to `staging` or
 * `production` on the deployed instance. Defaults to `staging` (the safe
 * default; prod must be opt-in).
 */
export function activeEnv(): EnvName {
  const raw = (process.env.STATIONLY_ENV || process.env.APP_ENV || '').trim().toLowerCase();
  if (raw === 'production' || raw === 'prod') return 'prod';
  return 'staging';
}

export interface ResolvedEnv {
  name: EnvName;
  baseUrl: string;
  adminKey?: string;
  /** The public client key (X-Stationly-Key) — lets health checks probe the
   * app surface exactly as the app does. Server-only, never shipped. */
  apiKey?: string;
  cfClientId?: string;
  cfClientSecret?: string;
  /** Base URL of the Syncer's status API (e.g. http://host.docker.internal:8081).
   * Opt-in: when unset, the syncer health check falls back to inferring health
   * from backend data freshness. Server-only, never shipped to the browser. */
  syncerUrl?: string;
  /** Bearer key for the Syncer's /sync-status (matches its SYNCER_STATUS_KEY). */
  syncerKey?: string;
}

// Per-env default backend URL (mirrors AppConfig.kt). Used only when the flat
// BACKEND_URL is not set — each VM normally sets BACKEND_URL explicitly.
const DEFAULT_URLS: Record<EnvName, string> = {
  staging: 'https://staging-api.stationly.co.uk',
  prod: 'https://api.stationly.co.uk',
};

// Per-env default public website URL (the StationUI marketing site). Used by
// the health dashboard when WEBSITE_URL is not set explicitly.
const DEFAULT_WEBSITE_URLS: Record<EnvName, string> = {
  staging: 'https://staging.stationly.co.uk',
  prod: 'https://stationly.co.uk',
};

/** The public website URL this deployment's health dashboard pings. */
export function websiteUrl(name: EnvName): string {
  const url = process.env.WEBSITE_URL || DEFAULT_WEBSITE_URLS[name];
  return url.replace(/\/+$/, '');
}

/**
 * Resolve the target env to its base URL + secrets. SERVER-ONLY.
 *
 * Config is FLAT and un-prefixed: each deployment (VM/container) carries only
 * its own environment's values in its `.env`, so there is nothing to
 * disambiguate. The file that's present IS the environment.
 *   BACKEND_URL · ADMIN_KEY · CF_ACCESS_CLIENT_ID · CF_ACCESS_CLIENT_SECRET
 *
 * `STATIONLY_ENV` (read by activeEnv) stays explicit — it drives the safety
 * banner/tone, not secret lookup.
 */
export function resolveEnv(name: EnvName): ResolvedEnv {
  const baseUrl = process.env.BACKEND_URL || DEFAULT_URLS[name];
  return {
    name,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    adminKey: process.env.ADMIN_KEY,
    apiKey: process.env.STATIONLY_API_KEY,
    cfClientId: process.env.CF_ACCESS_CLIENT_ID,
    cfClientSecret: process.env.CF_ACCESS_CLIENT_SECRET,
    syncerUrl: process.env.SYNCER_URL?.replace(/\/+$/, ''),
    syncerKey: process.env.SYNCER_STATUS_KEY,
  };
}
