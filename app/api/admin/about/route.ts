import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isValidSessionValue, SESSION_COOKIE } from '@/lib/session';
import { activeEnv, resolveEnv, websiteUrl, ENV_META } from '@/lib/env';
import pkg from '@/package.json';

export const runtime = 'nodejs';

/**
 * Non-secret build/runtime facts for the Settings screen. Deliberately returns
 * ONLY public config (version, env label, the backend/website URLs, node
 * version, uptime) — never the admin key, CF token or session secret.
 */
export async function GET() {
  const session = cookies().get(SESSION_COOKIE)?.value;
  if (!(await isValidSessionValue(session))) {
    return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });
  }

  const env = activeEnv();
  const cfg = resolveEnv(env);

  return NextResponse.json({
    appName: pkg.name,
    version: pkg.version,
    env,
    envLabel: ENV_META[env].label,
    backendUrl: cfg.baseUrl,
    websiteUrl: websiteUrl(env),
    hasAdminKey: Boolean(cfg.adminKey),
    hasApiKey: Boolean(cfg.apiKey),
    hasCfToken: Boolean(cfg.cfClientId && cfg.cfClientSecret),
    nodeVersion: process.version,
    uptimeSeconds: Math.round(process.uptime()),
  });
}
