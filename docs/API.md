# Backend Admin API Reference

All endpoints live under `/api/v1/admin/*` on the Stationly backend
(`src/admin/`). They are **not** in the OpenAPI docs (`/docs`,
`/openapi.json`) — no `@swagger` annotations — and are gated by
`AdminAuthMiddleware`.

## Authentication

Every request must send the admin key:

```
Authorization: Bearer <ADMIN_KEY>     # equals the backend's STATIONLY_ADMIN_KEY
```

Responses from the guard:
- `503` — `STATIONLY_ADMIN_KEY` unset/too short on the server (fail-shut)
- `401` — missing/!Bearer `Authorization` header
- `403` — wrong key (constant-time compare)

When Cloudflare Access is enabled on the server (`CF_ACCESS_TEAM_DOMAIN` +
`CF_ACCESS_AUD`), a valid `Cf-Access-Jwt-Assertion` is **also** required (the
console proxy provides it via a service token); otherwise `403`.

The mobile/public API (`X-Stationly-Key`) is a **different** credential and is
unaffected by the admin key.

---

## Endpoints

| Method | Path | Purpose | Firestore reads |
|---|---|---|---|
| POST | `/admin/notifications/send` | Send a push to an audience | 0–N* |
| GET | `/admin/notifications/history` | Recent sends (local audit log) | 0 |
| GET | `/admin/users` | Users list (summary) | 0 / 1 on `?refresh=1` |
| GET | `/admin/users/:uid` | Full user detail (profile, sessions, stations) | 0 (rare 1-doc fallback) |
| GET | `/admin/users/:uid/tokens` | Registered-device **count** (no raw tokens) | cache-first (5-min TTL) |
| GET | `/admin/waitlist` | Waitlist signups | 0 / 1 on `?refresh=1` |
| GET | `/admin/subscribed-stations` | Subscribed-station registry + names | 0 |
| GET | `/admin/stats` | Dashboard counts | 0 |

\* `token`/`tokens`/`topic`/`all`/`line` audiences = 0 reads (FCM fans out);
`uid`/`uids` resolve via the 5-min token cache.

---

### POST `/admin/notifications/send`

```jsonc
{
  "audience": { "type": "all" },              // see Audience types
  "payload": {
    "type": "announcement",                   // announcement | line_status_change | promo | system
    "title": "Piccadilly · Severe Delays",    // required
    "body": "Signal failure …",               // required
    "severity": "danger",                     // danger|warning|success|info|neutral (optional)
    "subtitle": "Status update",              // optional
    "style": "bigText",                       // bigText | bigPicture (optional)
    "imageUrl": "https://…",                  // HTTPS, used by bigPicture
    "color": "#FFB81C",                       // hex (optional)
    "lineId": "piccadilly",                   // auto-tints the chip (optional)
    "deepLink": "stationly://home"            // optional
  }
}
```

**Response** `200`:
```jsonc
{ "successCount": 1, "failureCount": 0, "messageId": "…", "failures": [ { "code": "…" } ] }
```
`400` on malformed payload/audience. Raw FCM tokens are never echoed in
`failures`. Every send (success or failure) is written to the local audit log.

#### Audience types

| `type` | `value` | Notes | Reads |
|---|---|---|---|
| `all` | — | broadcast via `stationly_all` topic | 0 |
| `line` | line id | `LineStatus_<id>` topic | 0 |
| `topic` | topic name | any FCM topic | 0 |
| `token` | one FCM token | testing on a device | 0 |
| `tokens` | string[] (≤500) | multicast | 0 |
| `uid` | Firebase uid | → user's registered devices | cache-first |
| `uids` | string[] (≤500) | batch of uids | cache-first |

---

### GET `/admin/notifications/history?limit=50`
Local SQLite audit log, newest first. Raw tokens are never stored.
```jsonc
{ "items": [ { "id","createdAt","audienceType","audienceSummary","payloadType",
               "title","body","severity","successCount","failureCount","messageId","ok" } ],
  "count": 50 }
```

### GET `/admin/users?refresh=1`
```jsonc
{ "items": [ { "uid","email","displayName","createdAt","lastLoggedInTime",
               "loggedIn","emailVerified","stationCount" } ],
  "count": 4, "cached": true, "refreshedAt": 1780000000000 }
```
`refresh=1` does one collection read and re-caches; otherwise served from the
SQLite slave (0 reads).

### GET `/admin/users/:uid`
Full detail (served from cache):
```jsonc
{ "uid","email","displayName","photoURL","signInProvider",
  "createdAt","updatedAt","lastLoggedInTime","loggedIn","emailVerified",
  "stationCount",
  "sessions": [ { "deviceId","platform","osVersion","model","appVersion","firstSeen","lastSeen" } ],
  "stations": [ { "id","name","line","mode","direction" } ] }
```

### GET `/admin/users/:uid/tokens?fresh=1`
```jsonc
{ "uid", "tokenCount": 2, "deliverable": true, "cached": true, "source": "cache" }
```
Count only — never the token strings. `fresh=1` bypasses the cache.

### GET `/admin/waitlist?refresh=1`
```jsonc
{ "items": [ { "id","email","joinedAt" } ], "count": 1, "cached": true, "refreshedAt": 0 }
```

### GET `/admin/subscribed-stations`
```jsonc
{ "items": [ { "naptanId","count","commonName","lat","lon","modes": ["overground"] } ], "count": 52 }
```

### GET `/admin/stats`
```jsonc
{ "transport": { "stations","lines","modes","lineStatuses" },
  "subscribedStations": 52,
  "users": { "total","active","refreshedAt" },
  "waitlist": { "total","refreshedAt" },
  "recentNotifications": [ /* last 5 history items */ ] }
```

---

## Notification payload — full field list

Mirrors the Android Kotlin `NotificationPayload` (parsed with
`ignoreUnknownKeys`). Required: `type`, `title`, `body`.

`severity` (danger/warning/success/info/neutral), `subtitle`, `summary`,
`channel`, `priority` (max/high/default/low/min), `color` (hex), `imageUrl`
(HTTPS), `largeIconUrl`, `style` (bigText/bigPicture/inbox), `deepLink`,
`actions` (≤3 `{label,deepLink}`), `groupKey`, `notificationId`, and status
extras `lineId`/`lineName`/`previousStatus`/`newStatus`.

The console composer intentionally exposes only the subset the app dispatcher
renders meaningfully for an admin push.

---

## Health probing (read-only)

The console's **Health dashboard** (`/health`) does not add backend endpoints —
it *consumes* the existing surface read-only. A server-side scheduler probes,
every ~5 min: the liveness root `GET /`; the app-facing `/api/v1/*` endpoints
above the table lists (with the public `X-Stationly-Key`, params discovered by
chaining `/modes` → `/lines/mode/:mode` → `/stations/line/:lineId`); the
`/user/*` routes at their **auth gate** (no Firebase token → expect `401`, no
side effects); the admin endpoints in this doc; and the StationUI website. The
**syncer** (no endpoint) is inferred from `/modes`, `/lines/status` and
`/admin/stats` freshness. `POST /auth/forgot-password` is deliberately not
probed. Aggregated results are served (session-gated) from the console's own
`GET /api/admin/health`; `POST` triggers an immediate cycle. See
`OPERATIONS.md §7b`.
