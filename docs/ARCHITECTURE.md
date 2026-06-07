# Admin Console — Architecture

The Stationly Admin Console is an internal operations tool for the Stationly
backend's admin API. It is a **separate Next.js app** (`admin-console/`) that
runs as its own process — it is **not** part of the public mobile API or the
marketing website.

> No secrets appear in this repo. Hostnames, the SSH key, the admin key, the
> console password and the session secret all live in gitignored files
> (`.env.local`, `staging_*.sh`) or on the server. Docs use placeholders such
> as `<STAGING_HOST>` and `<ADMIN_KEY>`.

---

## Components

```
┌─────────────────────────────────────────────────────────────────────┐
│ Browser (your team)                                                   │
│   - holds only a signed, httpOnly session cookie (no secrets)         │
└───────────────┬─────────────────────────────────────────────────────┘
                │ HTTPS
┌───────────────▼─────────────────────────────────────────────────────┐
│ nginx (staging-admin.stationly.co.uk) → reverse proxy → 127.0.0.1:4000│
└───────────────┬─────────────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────────────┐
│ Admin Console — Next.js 14, Docker container "stationly-admin" (:4000)│
│   - pages + UI (dashboard, health, notifications, history, users,     │
│     waitlist, subscribed stations)                                    │
│   - /api/* route handlers = the SERVER-SIDE PROXY (holds the secrets) │
└───────────────┬─────────────────────────────────────────────────────┘
                │ attaches Authorization: Bearer <ADMIN_KEY> (+ CF token)
┌───────────────▼─────────────────────────────────────────────────────┐
│ Backend admin API  →  /api/v1/admin/*  (Express, pm2 "stationly-backend")│
│   served from in-memory cache + local SQLite (minimal Firestore I/O)  │
└───────────────────────────────────────────────────────────────────────┘
```

## The server-side key proxy (the core idea)

The browser **never** holds the admin key. It only talks to the console's own
`/api/admin/*` route handlers, which are gated by the session cookie. Those
handlers run on the Next **server**, where they attach the real admin key (and,
when configured, the Cloudflare Access service token) before calling the
backend's `/api/v1/admin/*`.

- Browser → `POST /api/admin/notifications` (cookie only)
- Console server → `POST <BACKEND>/api/v1/admin/notifications/send`
  with `Authorization: Bearer <ADMIN_KEY>`

Source of truth: `lib/backend.ts` (server-only, `import 'server-only'`).

---

## Security layers (defence in depth)

Five independent layers; any one failing does not open the door.

| # | Layer | Where | What it stops |
|---|-------|-------|---------------|
| 1 | Not on the public surface | separate subdomain, `noindex`, admin routes carry no `@swagger` so they're absent from `/docs` & `/openapi.json` | discovery / scanners |
| 2 | **Cloudflare Access** (recommended) | Zero Trust app on the subdomain **and** the `/api/v1/admin/*` path | anyone without a team login reaches neither the console nor the admin API |
| 3 | App login | password → signed httpOnly session cookie; `middleware.ts` redirects unauthenticated requests | anonymous use of the console |
| 4 | Admin key | `Authorization: Bearer`, constant-time compare, **fail-shut** (503 if unset) | calls to the backend admin API without the key |
| 5 | Cloudflare Access JWT (opt-in) | backend verifies `Cf-Access-Jwt-Assertion` when `CF_ACCESS_TEAM_DOMAIN`+`CF_ACCESS_AUD` are set | a leaked key used from outside Cloudflare / via the raw origin IP |

See [cloudflare_access.md](cloudflare_access.md) for the full Access + origin-lock setup.

The mobile app is unaffected: Access (layer 2) is scoped to the `/admin` path
only; clients hit `/api/v1/*` normally.

---

## Environment model

The console targets **exactly one** environment, fixed by the deployment via
`STATIONLY_ENV` (`staging` | `production`) — there is **no env switcher in the
UI**. The target env (URL + secrets) is resolved **server-side** in every proxy
(`activeEnv()` / `resolveEnv()` in `lib/env.ts`); the browser can't choose it.

- A **staging** deployment talks only to `staging-api.stationly.co.uk` and shows
  a pulsing orange **⚠ STAGING ENVIRONMENT** banner (mirrors the app's
  `StagingBanner`).
- A **production** deployment talks only to `api.stationly.co.uk`, no banner.
- Production sends — and any broadcast (`all` / `line` / `topic`) — require a
  confirm dialog.

URLs mirror `StationlyUI/core/.../config/AppConfig.kt`.

---

## Data model & Firestore read/write budget

The backend follows a **master → slave → cache** model and the console is built
to keep Firestore I/O at (near) zero:

- **Firestore** = master
- **SQLite** (`data/stationly.sqlite`) = slave replica
- **in-memory** maps/arrays = cache

| Console action / endpoint | Firestore reads |
|---|---|
| Dashboard `/admin/stats` | **0** (memory + SQLite) |
| Subscribed stations `/admin/subscribed-stations` | **0** (memory + SQLite) |
| Users list `/admin/users` (normal) | **0** (SQLite slave) |
| Users list `/admin/users?refresh=1` | **1 collection read**, then re-cached |
| User detail `/admin/users/:uid` | **0** (cache); rare 1-doc fallback, then cached |
| `uid`/`uids` sends (token lookup) | **0** (cache-first, 5-min TTL) |
| Send history `/admin/notifications/history` | **0** (local SQLite audit log) |
| Notifications `token`/`tokens`/`topic`/`all`/`line` | **0** (FCM fans out) |
| **Health dashboard** (every 5 min, all probes) | **0** (see below) |

**Health probes & the Firestore budget.** The health scheduler hits real
endpoints every 5 min but stays at **0 Firestore reads** in steady state: admin
probes never pass `?refresh=1` (served from cache/SQLite); public probes only
read Firestore on a *cold-cache miss* (`length === 0 && !cacheReady`); the
`/lines/status` probe is guarded by the backend's 10-min TTL + change-detection
so it triggers **~0 Firestore writes** (and the syncer catches real changes
anyway); user-gated probes 401 at the gate (no handler, no I/O); and the
waitlist probe is rejected at validation (no write). The only side effect is the
occasional TfL fetch any app client would also cause.

**Writes:** the console performs **no Firestore writes**. Slave snapshots and the
send-history audit log are written to **SQLite only**.

Implementation:
- `src/admin/adminDataService.ts` — users/waitlist master→slave→cache (incl.
  sessions + subscribed stations for the detail view).
- `src/services/userFcmTokenService.ts` — per-uid token cache (5-min TTL).
- `src/services/localDbService.ts` — SQLite slave tables (`users`,
  `user_waitlist`) + the `admin_notifications` local audit log.
- `src/services/dataCacheService.ts` — in-memory transport metadata (stations,
  lines, modes, line statuses) replicated from Firestore.

---

## Notifications & SDUI

Push notifications flow through `NotificationService.send(audience, payload)` →
FCM `data` message under `notification_payload` → the Android
`NotificationDispatcher` renders it. The payload is its **own** server-driven
mechanism (the "SDUI for notifications" idea): the backend evolves notification
UX via the payload with no APK release. The app's separate **SDUI** path
(layouts) is untouched by the console.

The console's composer only exposes fields the dispatcher actually renders
(type, title, body, severity, subtitle, style=bigText/bigPicture, colour,
imageUrl, deepLink, line tint). See `API.md` for the full payload shape.

---

## Tech

- Next.js 14 (App Router), `output: 'standalone'` → built into a Docker image
  (`ghcr.io/mavericknyk/stationly-admin`), promoted same-image staging → prod.
- Docker container `stationly-admin` on port 4000, behind nginx + Let's Encrypt;
  deployed via the "Deploy" GitHub Action (pull + `docker compose up -d`).
- TypeScript throughout; no client-side secrets (`server-only` guard on
  `lib/backend.ts`).
