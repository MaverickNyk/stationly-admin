# Stationly Admin Console

Internal Next.js operations console for the Stationly backend admin API —
send notifications, browse users (profile, devices/sessions, subscribed
stations), inspect the waitlist and subscribed-station registry, and view send
history. It runs as its own process behind nginx; it is **not** part of the
public mobile API or the marketing website.

> **No secrets in this repo.** The host, SSH key, admin key, console password
> and session secret live only in gitignored files (`.env.local`,
> `staging_*.sh`) or on the server. Docs use placeholders.

## Documentation

| Doc | What's in it |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Components, the server-side key proxy, security layers, env model, the master→slave→cache data model & Firestore read/write budget, SDUI note |
| [docs/API.md](docs/API.md) | Backend `/api/v1/admin/*` reference — every endpoint, payloads, read costs |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Runbook — config, deploy, nginx+TLS, pm2, rotating secrets, troubleshooting, local dev |
| [CLOUDFLARE_ACCESS.md](CLOUDFLARE_ACCESS.md) | Locking it down: Cloudflare Access apps + origin firewall |

## At a glance

- **One environment per deployment** (`STATIONLY_ENV=staging|production`) — no
  in-UI switcher; staging shows a ⚠ banner. Resolved server-side.
- **Five security layers** — Cloudflare Access · password session · server-side
  key proxy · admin key (fail-shut) · backend Access-JWT check.
- **Minimal Firestore I/O** — dashboard/detail/lookup/history are 0-read
  (in-memory + SQLite); only an explicit Refresh costs 1 collection read; **no
  Firestore writes**.

## Screens

- **Dashboard** (`/`) — user/waitlist/subscribed counts, transport cache sizes,
  recent sends, quick actions.
- **Notifications** (`/notifications`) — composer with live device preview;
  target by `all`/`line`/`topic`/`token`/`tokens`, or a **user picked by
  email/name** (single or multiple).
- **Audiences** (`/audiences`) — search a user by email/name/UID → device count.
- **History** (`/history`) — recent sends from the local audit log.
- **Users** (`/users`) — searchable list; click a row for full detail (profile,
  devices/sessions, subscribed stations).
- **Waitlist** (`/waitlist`) — signups, CSV export.
- **Stations** (`/stations`) — subscribed-station registry by subscriber count.

## Quick start (local dev)

```bash
cd admin-console
cp .env.local.example .env.local   # set ADMIN_PASSWORD, SESSION_SECRET, STAGING_ADMIN_KEY
npm install
npm run dev                        # http://localhost:4000
```

See [docs/OPERATIONS.md](docs/OPERATIONS.md) for deploying to staging/prod.
