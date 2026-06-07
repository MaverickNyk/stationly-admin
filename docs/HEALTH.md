# Health Dashboard

The **Health** screen (`/health`) continuously probes **every backend endpoint
the StationlyUI app actually calls** — the way the app calls it — plus the
public website and the (endpoint-less) data syncer, so a break is caught
*before* it leaves the app in a blocked state for real users.

It runs on a **server-side scheduler** (not browser polling): a single
`setInterval` started on server boot probes everything **at least once every 5
minutes** for the life of the container, whether or not anyone has the page open.

> **Firestore budget:** the probes are **0 Firestore reads** in steady state and
> **~0 writes** — see [Firestore cost](#firestore-cost). This is by design and
> must stay that way (the platform's master→slave→cache model keeps Firestore
> I/O near zero; see [ARCHITECTURE.md](ARCHITECTURE.md)).

---

## Contents
- [How it works](#how-it-works)
- [What gets probed](#what-gets-probed)
- [Status model](#status-model)
- [Syncer inference](#syncer-inference)
- [TLS certificate checks](#tls-certificate-checks)
- [Website probe & staging basic-auth](#website-probe--staging-basic-auth)
- [Alerting](#alerting)
- [Firestore cost](#firestore-cost)
- [Configuration](#configuration)
- [API](#api)
- [UI](#ui)
- [Local testing](#local-testing)
- [Troubleshooting](#troubleshooting)
- [Design notes & out of scope](#design-notes--out-of-scope)

---

## How it works

```
instrumentation.ts register()            (on server boot, Node runtime only)
        ▼
lib/health/scheduler.ts  ensureScheduler()
        │  one guarded setInterval (globalThis singleton) → runs a cycle now + every 5 min
        ▼
lib/health/checks.ts  runHealthCycle(env)   ← single-flighted (manual + scheduled coalesce)
        ├─ lib/backend.ts   probe*()   server-only — holds ADMIN_KEY + X-Stationly-Key
        ├─ lib/health/website.ts  probeWebsite()
        └─ lib/health/tls.ts      checkTls()
        ▼
lib/health/store.ts  in-memory ring buffer (latest + history + transitions)
        ├─► lib/health/notify.ts  notifyTransitions()  → webhook (on state change)
        ▲
app/api/admin/health/route.ts  GET snapshot (session-gated) · POST run-now
        ▲
components/HealthDashboard.tsx ← app/health/page.tsx   (client polls the snapshot every 30s)
        └─ also surfaced as a status banner on the Dashboard (/)
```

| File | Responsibility |
|---|---|
| `instrumentation.ts` | Next.js boot hook — starts the scheduler (`experimental.instrumentationHook`). |
| `lib/health/scheduler.ts` | Single guarded `setInterval`; immediate first run; `runOnce()` for the button. |
| `lib/health/checks.ts` | `runHealthCycle(env)` — runs every probe, computes the syncer inference, writes results, fires alerts. Single-flighted. |
| `lib/health/registry.ts` | The static list of everything probed (id/group/label/method/path/expected). Shared by the cycle **and** the UI so they never drift. |
| `lib/health/store.ts` | In-memory ring buffer: latest result per check, 24h history, uptime %, status transitions. |
| `lib/health/website.ts` | Website HTTP probe (no secrets). |
| `lib/health/tls.ts` | TLS certificate expiry check (raw `tls.connect`). |
| `lib/health/notify.ts` | Posts alerts to a webhook on state changes. |
| `lib/backend.ts` | Server-only probe helpers (hold the admin key + client key). |
| `app/api/admin/health/route.ts` | Session-gated `GET` (snapshot) / `POST` (run now). |
| `app/health/page.tsx` + `components/HealthDashboard.tsx` | The screen. |

**History** is an in-memory ring buffer (default 288 entries/check = 24h @ 5min)
— no database dependency. It **resets on container restart**; that's acceptable
for an at-a-glance ops view (SQLite persistence is a noted future upgrade).

---

## What gets probed

Each check is probed with the **strongest credential the console can present**
and an **expected** outcome. The registry lives in `lib/health/registry.ts`.

### Liveness (no key)
| Check | Probe | Expect |
|---|---|---|
| Backend root | `GET /` | `200` + body `status` contains "Online" |

### App surface — `X-Stationly-Key` (probed exactly as the app does)
Params are resolved by **chained discovery** (`/modes` → first mode → `/lines/mode/:mode`
→ first line → `/stations/line/:lineId` → first naptanId), with static env
fallbacks so each probe is independent if a parent fails.

| Check | Method | Expect |
|---|---|---|
| SDUI layout / login / register / forgot-password / about / home-announcement / home-config / theme-tokens | `GET /sdui/app/*` | `200` |
| Modes | `GET /modes` | `200` + non-empty |
| Lines by mode | `GET /lines/mode/:mode` | `200` |
| Line statuses | `GET /lines/status?mode=` | `200` (feeds the syncer signal) |
| Line route | `GET /lines/:lineId/route` | `200` |
| Stations by line | `GET /stations/line/:lineId` | `200` |
| Station search | `GET /stations/search?searchKey=` | `200` |
| Nearby stations | `GET /stations/nearby?lat=&lon=` | `200` |
| Resolve station | `GET /stations/resolve?station=&mode=&line=&direction=` | `200` |
| Station predictions | `GET /stations/predictions/:naptanId` | `200` |
| Subscribed station ids | `GET /stations/subscribed-ids` | `200` |
| Waitlist join (website form) | `POST /waitlist/join` (malformed body) | `400` (validation — no row created) |

> Without `STATIONLY_API_KEY`, the keyed app-surface probes report **`skipped`**
> (clearly flagged per-row) and the dashboard runs on liveness + admin + TLS +
> website only.

### User-gated — `X-Stationly-Key`, **no** Firebase token (expect 401)
`/user/sync/profile` (GET+POST), `/user/sync/stations`, `/user/stations/add`,
`/user/stations/delete`, `/user/logout`, `/user/delete-account`,
`/user/fcm/register`, `/user/fcm/unregister`, `/user/send-verification-email`,
`/sdui/app/profile/:uid`.

The auth middleware rejects with **401 before the handler**, proving the route
is mounted and not 5xx-ing — with **zero side effects**.

### Admin — `Authorization: Bearer <ADMIN_KEY>`
| Check | Probe | Expect |
|---|---|---|
| Admin auth + send pipeline | `POST /admin/notifications/send` (empty body) | `400` (= key matches; `403` mismatch, `503` key unset) |
| Admin stats / history / users / waitlist / subscribed-stations | `GET` | `200` |

### Syncer (inferred) · TLS certs · Website
See the dedicated sections below.

> **Not probed:** `POST /auth/forgot-password` — to avoid sending password-reset
> emails and tripping its 3-per-15-min rate limiter.

---

## Status model

| Status | Meaning |
|---|---|
| `up` | Responded as expected. |
| `degraded` | Reachable but not fully healthy — unexpected (non-error) code, **slow** (> `HEALTHCHECK_SLOW_MS`), **429** rate-limited, a key/auth mismatch, stale syncer data, or a cert nearing expiry. |
| `down` | Timeout, network failure, `5xx`, or an unexpected error status — the app would be blocked. |
| `skipped` | Not probed (e.g. missing client key, or no discovered naptanId). |

**Roll-up / overall ordering:** `down > degraded > up > skipped`. `skipped` is
the lowest, so it never masks real health — a group with some measured `up`
checks and some `skipped` reads `up`, while a group where *everything* is
skipped reads `skipped`.

**Cross-cutting rules** (`lib/health/checks.ts`):
- An `up` probe slower than `HEALTHCHECK_SLOW_MS` (default 2500ms) → **degraded (slow)**.
- A `429` → **degraded (rate-limited)**, never down.
- Every probe has an AbortController timeout (`HEALTHCHECK_TIMEOUT_MS`, default 10s) and never throws.

**Incident context:** each check tracks `since` (when its current state began)
and `fails` (consecutive non-`up` cycles), shown in the UI as *"since 15m (3×)"*.

---

## Syncer inference

The `StationlySyncer` is a separate service with **no HTTP endpoint**, so its
health is *inferred*. Cadences (for context): predictions every **30s**, line
statuses every **10m**, station catalogue **monthly**.

- **Strong signal = data presence.** Authoritative source is admin `/admin/stats`
  transport counts (`stations`, `lines`, `lineStatuses`). Empty caches ⇒ `down`.
  (The public `/modes` / `/lines/status` counts are only a *fallback* when stats
  is unavailable — a `0` there can mean "probe skipped (no key)", **not** "cache
  empty", so it must never be read as an outage.)
- **Freshness signal** = newest line-status `lastUpdatedTime`. Because statuses
  only re-stamp **on change**, a quiet network can legitimately be old, so
  extreme staleness (> `HEALTHCHECK_SYNCER_STALE_MS`, default 24h) is reported
  `degraded`, **never** `down`.

---

## TLS certificate checks

Opens a raw `tls.connect` to the backend and website hosts (`:443`) and reads
the peer certificate's `valid_to`:
- **expired** (`daysLeft <= 0`) → `down`
- within `HEALTHCHECK_TLS_WARN_DAYS` (default 14) → `degraded`
- otherwise → `up` (shows e.g. *"valid 69d"*).

An expired cert silently blocks the app (the client refuses the connection), so
this catches it before users do.

---

## Website probe & staging basic-auth

`GET WEBSITE_URL` (redirect-following) → expect `200`. Default host per env:
staging `https://staging.stationly.co.uk`, prod `https://stationly.co.uk`
(override with `WEBSITE_URL`).

The **staging** website is behind **HTTP Basic auth**; production is not. Set
`WEBSITE_BASIC_AUTH="user:pass"` and the probe authenticates — **only when
`STATIONLY_ENV=staging`** (`websiteAuthHeader(env)`), so production is never sent
credentials even if the var is present. Without it, a healthy gated staging site
reads `401` → `degraded`.

---

## Alerting

When a check **changes state**, the scheduler POSTs a message to a webhook so ops
hears about an outage without watching the dashboard (`lib/health/notify.ts`).

- **`HEALTH_ALERT_WEBHOOK`** — the incoming-webhook URL. **Blank ⇒ alerting is
  OFF** (a no-op). Works with any endpoint that accepts a JSON `{ "text": "…" }`
  body:
  - **Slack:** an Incoming Webhook URL, e.g. `https://hooks.slack.com/services/T…/B…/…`
  - **Discord:** the channel webhook URL **with `/slack` appended**, e.g.
    `https://discord.com/api/webhooks/…/…/slack`
  - **Mattermost / generic:** any URL that accepts `{text}`.
- **`HEALTH_ALERT_ON_DEGRADED`** — set to **`1`** to also alert on `degraded`
  transitions (slow / 429 / cert-expiring). **Blank/unset ⇒ `down` + recovery
  only** (the quieter default).

**Behaviour:**
- Fires only on the **edge** (a status *change*), never repeating every cycle.
- **No alert-storm on boot** — transitions are only emitted *between* known
  states, never on the first-ever result.
- Alerts on entering `down` and on **recovery from `down`** (plus `degraded`
  edges when opted in). Each message is one POST covering all changes in the cycle.

Example message:
```
*Stationly health (staging)* — 1 change
🔴 *Backend root* DOWN (up → down) — timeout after 10000ms
```

---

## Firestore cost

The probes hit real endpoints every 5 min but stay within the platform's
minimal-I/O motto:

| Probe group | Firestore | Why |
|---|---|---|
| Admin (`/admin/*`) | **0 reads** | never pass `?refresh=1` → served from cache / SQLite slave |
| Public (`/modes`, `/lines/mode`, `/stations/*`) | **0 in steady state** | Firestore read only on a *cold-cache miss* (`length === 0 && !cacheReady`) |
| `/lines/status` | **~0 writes** | backend's 10-min TTL guard + change-detection; the syncer catches real changes anyway |
| `/stations/predictions` | **0** | SQLite-cached + TfL on stale |
| User-gated `/user/*` | **0** | 401 at the gate — handler never runs, no I/O |
| Waitlist-join | **0 writes** | rejected at validation |

The only external side effect is the occasional **TfL** fetch any app client
would also cause (line status ≈ every 10 min, predictions/route per cycle) — not
Firestore.

---

## Configuration

All optional except `STATIONLY_API_KEY` (needed to probe the app surface).
Backend URL + admin key reuse the existing `BACKEND_URL` / `ADMIN_KEY`.

| Var | Default | Purpose |
|---|---|---|
| `STATIONLY_API_KEY` | — | Public client key (`X-Stationly-Key`) to probe the app surface. Unset ⇒ those probes `skipped`. |
| `WEBSITE_URL` | per-env | Public site to ping (staging `staging.stationly.co.uk`, prod `stationly.co.uk`). |
| `WEBSITE_BASIC_AUTH` | — | `user:pass` for a basic-auth-gated site. **Applied only on staging.** |
| `HEALTHCHECK_INTERVAL_MS` | `300000` | Cycle cadence (5 min). |
| `HEALTHCHECK_TIMEOUT_MS` | `10000` | Per-probe timeout. |
| `HEALTHCHECK_HISTORY` | `288` | Results retained per check (24h @ 5min). |
| `HEALTHCHECK_SEARCH` | `king` | Sample `searchKey` for `/stations/search`. |
| `HEALTHCHECK_LATLON` | `51.5074,-0.1278` | Sample `lat,lon` for `/stations/nearby`. |
| `HEALTHCHECK_SLOW_MS` | `2500` | An `up` probe slower than this ⇒ degraded. |
| `HEALTHCHECK_TLS_WARN_DAYS` | `14` | Cert within this many days of expiry ⇒ degraded. |
| `HEALTHCHECK_SYNCER_STALE_MS` | `86400000` | No line-status change in this long ⇒ syncer degraded (24h). |
| `HEALTH_ALERT_WEBHOOK` | — | Alert webhook URL. Blank ⇒ alerting off. |
| `HEALTH_ALERT_ON_DEGRADED` | — | `1` to also alert on degraded. |

---

## API

Both handlers are **session-gated** (same cookie as the rest of the console) and
run on the Node runtime.

| Method | Path | Does |
|---|---|---|
| `GET` | `/api/admin/health` | Returns the latest aggregated snapshot (`HealthSnapshot`). |
| `POST` | `/api/admin/health` | Runs a cycle on demand ("Run check now"), then returns the snapshot. |

`HealthSnapshot` (see `lib/health/types.ts`): `{ lastCycleAt, running, intervalMs,
overall, rollups[], checks[], history{}, uptime{} }`.

The actual probing is driven by the server-side scheduler; both handlers also
call `ensureScheduler()` as a belt-and-braces fallback.

---

## UI

- **`/health`** — per-group status cards, a grouped endpoint table (status dot ·
  method · path · expected vs actual code · latency · 24h uptime strip · detail),
  ↻ Refresh + ▶ Run check now, auto-refresh every 30s. Browser only *reads* the
  stored snapshot; it never drives the probing.
- **Dashboard (`/`)** — a status banner ("Platform: All systems go / N down")
  links to `/health`, surfacing platform health on the landing page.

---

## Local testing

```bash
cp .env.example .env.local     # set ADMIN_PASSWORD, SESSION_SECRET, ADMIN_KEY,
                               # STATIONLY_API_KEY, STATIONLY_ENV=staging
npm install && npm run dev     # http://localhost:4000
```

1. Log in → open **/health**. Within seconds each group reports status.
2. **Scheduler runs without the page open:** note `lastCycleAt`, close the tab,
   reopen after >5 min → it advanced and history grew. Server logs show
   `[health] cycle complete` every ~5 min.
3. **Failure paths:** bad `BACKEND_URL` ⇒ backend probes `down`; wrong `ADMIN_KEY`
   ⇒ admin auth `degraded`; wrong/empty `STATIONLY_API_KEY` ⇒ app probes
   `skipped`/`down`; closed `WEBSITE_URL` ⇒ website `down`.
4. **Alerting:** set `HEALTH_ALERT_WEBHOOK`, restart, force a flip (e.g. point
   `BACKEND_URL` at a bad host for one cycle) → a message posts to the webhook.

> In dev, **don't run `npm run build` while `npm run dev` is running** — the
> production build clobbers the dev `.next` chunk manifest and you'll get a
> `__webpack_modules__[moduleId] is not a function` 500. Fix: stop dev,
> `rm -rf .next`, restart.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| App surface all `skipped` | `STATIONLY_API_KEY` unset — add the client key. |
| Website `degraded (401)` on staging | Site is basic-auth gated — set `WEBSITE_BASIC_AUTH=user:pass`. |
| Admin auth `degraded (403)` | Console `ADMIN_KEY` ≠ backend `STATIONLY_ADMIN_KEY`. |
| Syncer `down` "caches empty" | Backend caches genuinely empty / `/admin/stats` unreachable — check the backend + syncer. |
| No `[health]` logs in the container | Confirm `experimental.instrumentationHook` is set and `instrumentation.ts` is bundled. |
| No alerts firing | `HEALTH_ALERT_WEBHOOK` unset, or only `degraded` changes occurred without `HEALTH_ALERT_ON_DEGRADED=1`. |

---

## Design notes & out of scope

- **Server-side scheduler, not client polling** — satisfies "checked every 5 min,
  continuously," independent of any open browser tab.
- **History persistence (SQLite)** — currently in-memory (resets on restart); a
  possible future upgrade.
- **Live Line Status board** with one-click "notify subscribers" — a proposed
  flagship feature that builds on the same `/lines/status` data; not yet built.
