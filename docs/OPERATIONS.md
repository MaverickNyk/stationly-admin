# Admin Console — Operations Runbook

Canonical runbook for building, deploying, and operating the admin console.
No secrets in this file — placeholders: `<VM_HOST>` (a server),
`<SSH_KEY>` (path to the deploy SSH key), `<ADMIN_KEY>`, `<PASSWORD>`.

The console ships as a **Docker image**. You build & test it locally, push it to
**GitHub Container Registry (GHCR)**, and deploy by triggering a **GitHub
Action** that pulls the *same image* onto the target VM. The host's **nginx**
terminates TLS and proxies to the container; **Cloudflare Access** gates the
login.

---

## 1. Architecture & request flow

```
Build (your Mac, arm64)         Registry                Each VM
─────────────────────           ────────                ───────────────────────────
release.sh: docker build  ──►   ghcr.io/mavericknyk/    docker compose pull <tag>
            docker push         stationly-admin:<tag>   docker compose up -d
                                                        └─ container on 127.0.0.1:4000

Public request path:
  team member ─► Cloudflare Access (OTP, email allowlist)
              ─► nginx :443 (existing Let's Encrypt cert)  ─► container :4000
              ─► console password ─► server-side admin-key proxy ─► backend API
```

Three independent layers protect it: **Cloudflare Access → console password →
server-side admin-key proxy**. The VMs are **arm64**, so images are built on the
arm64 Mac (the GitHub runner is amd64 and only *deploys*, never builds).

- **Staging VM:** `79.72.94.209` (`stationly-be`) — shared with the backend.
- **Prod VM:** separate host (set up when prod goes live).

---

## 2. Config — the per-VM `.env` (flat, gitignored)

Config is **flat and un-prefixed**: each VM's `.env` holds only its own
environment's values. The file that's present *is* the environment. Template:
`.env.example`.

```ini
STATIONLY_ENV=staging                 # staging | production — drives the safety banner
ADMIN_PASSWORD=<PASSWORD>             # console login
SESSION_SECRET=<random hex>          # openssl rand -hex 32  (signs the session cookie)
BACKEND_URL=https://staging-api.stationly.co.uk   # backend this console targets
ADMIN_KEY=<ADMIN_KEY>                # MUST equal the backend's STATIONLY_ADMIN_KEY
# Only if the backend's /admin/* API is gated behind Cloudflare Access:
CF_ACCESS_CLIENT_ID=
CF_ACCESS_CLIENT_SECRET=
```

- Lives on the VM at `~/stationly-admin/.env`, **chmod 600**, never committed.
- The image is config-free; compose injects this file at container start
  (`env_file: .env`).
- **Golden rule:** `ADMIN_KEY` (console) must equal `STATIONLY_ADMIN_KEY`
  (backend) for the same environment, or you get `403 Invalid admin
  authorization token`.

> Editing `.env` changes nothing live until you `docker compose up -d` (the
> deploy Action does this). To apply a secret change without a new image:
> edit `~/stationly-admin/.env` on the VM, then `cd ~/stationly-admin &&
> docker compose up -d`.

---

## 3. Day-to-day: release & deploy

### 3a. Build, test, push (local — `release.sh`)

```bash
# fast inner loop (no Docker): npm run dev → http://localhost:4000
./release.sh          # builds ghcr.io/...:<tag>, prompts you, pushes on "y"
```
`release.sh` tags the image `<UTC-datetime>-<git-sha>` (e.g.
`20260607-1430-03cfc58`, plus `-dirty` if the tree has uncommitted changes),
also moves `:latest`, lets you test that exact image (`docker run --env-file
.env.local -p 4000:4000 …`), and pushes to GHCR only if you confirm. It prints
the `<tag>` to deploy.

### 3b. Deploy (GitHub Action — manual)

**GitHub → Actions → "Deploy" → Run workflow**, then choose:
- **environment:** `staging` or `prod`
- **tag:** the tag `release.sh` printed (e.g. `20260607-1430-03cfc58` — UTC build time + commit)

The Action SSHes to that VM and runs `docker compose pull && docker compose up
-d` for the tag, then health-checks `127.0.0.1:4000/login`.

### 3c. Promote staging → prod

```
Run workflow → staging, tag=20260607-1430-03cfc58   → verify on staging-admin.stationly.co.uk
Run workflow → prod,    tag=20260607-1430-03cfc58   → prod pulls the SAME image (identical bytes)
```
Same `<tag>` both times = prod runs exactly what you verified on staging.

### 3d. Rollback

Re-run the Deploy Action with an **older `<tag>`** that's still in GHCR. No
rebuild needed.

---

## 4. First-time setup per VM (once)

1. **Backend first** so `/admin/*` routes exist (else data screens return
   `Missing 'X-Stationly-Key'`).
2. **DNS:** proxied (orange-cloud) record `staging-admin.stationly.co.uk →
   <VM_HOST>` (prod: `admin.stationly.co.uk`).
3. **Docker:**
   ```bash
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker $USER && newgrp docker
   docker compose version    # confirm the compose plugin is present
   ```
4. **GHCR login** (so the VM can pull the private image):
   ```bash
   echo <GHCR_READ_PAT> | docker login ghcr.io -u MaverickNyk --password-stdin
   ```
   (`<GHCR_READ_PAT>` = a GitHub PAT with `read:packages`.)
5. **App dir + env:**
   ```bash
   mkdir -p ~/stationly-admin
   nano ~/stationly-admin/.env      # fill from .env.example
   chmod 600 ~/stationly-admin/.env
   ```
   Copy `docker-compose.yml` into `~/stationly-admin/` (the Deploy Action
   expects it there; the first deploy assumes it exists).
6. **nginx site** (TLS via the host's existing Let's Encrypt cert). A cert for
   the domain must already exist under `/etc/letsencrypt/live/<domain>/` (certbot
   auto-renews it). Install the site — file named `stationly-admin`,
   generic except the domain:
   ```bash
   DOMAIN=staging-admin.stationly.co.uk
   sudo tee /etc/nginx/sites-available/stationly-admin > /dev/null <<EOF
   upstream stationly_admin { server 127.0.0.1:4000; }
   server {
       listen 80;
       server_name ${DOMAIN};
       location / { return 301 https://\$host\$request_uri; }
   }
   server {
       server_name ${DOMAIN};
       listen 443 ssl;
       ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
       include /etc/letsencrypt/options-ssl-nginx.conf;
       ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
       add_header X-Robots-Tag "noindex, nofollow" always;
       location / {
           proxy_pass http://stationly_admin;
           proxy_http_version 1.1;
           proxy_set_header Host \$host;
           proxy_set_header X-Real-IP \$remote_addr;
           proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto \$scheme;
           proxy_set_header Upgrade \$http_upgrade;
           proxy_set_header Connection "upgrade";
       }
   }
   EOF
   sudo ln -sf /etc/nginx/sites-available/stationly-admin /etc/nginx/sites-enabled/stationly-admin
   sudo nginx -t && sudo systemctl reload nginx
   ```
   (Reference template: `deploy/nginx-admin.conf.template`.)
7. **Cloudflare Access** before sharing the URL — section 6.

Auto-restart on reboot is handled by the container's `restart: unless-stopped`
— no pm2.

---

## 5. GitHub setup (GHCR + the Deploy Action)

### 5a. Local push auth (your Mac, once)
```bash
echo <GHCR_WRITE_PAT> | docker login ghcr.io -u MaverickNyk --password-stdin
```
`<GHCR_WRITE_PAT>` = a GitHub PAT with `write:packages` (and `read:packages`).

### 5b. Environments + secrets
**Settings → Environments** → create `staging` and `prod`. On each, add secrets:

| Secret | Value |
|--------|-------|
| `SSH_HOST` | the VM IP (staging: `79.72.94.209`) |
| `SSH_USER` | `ubuntu` |
| `SSH_KEY`  | the **private** SSH deploy key contents |

Optionally set **Required reviewers** on `prod` to gate prod deploys behind a
manual approval click.

> GHCR image visibility is private by default — that's why each VM needs the
> `read:packages` login in step 4.4.

---

## 6. Cloudflare Access (the login wall)

Full guide: `../CLOUDFLARE_ACCESS.md`. The console's piece (App #1):

1. **Zero Trust → Settings → Authentication:** One-time PIN is the default
   login method (no setup needed); add Google for SSO if you want.
2. **Access controls → Applications → Add → Self-hosted:**
   - Destination (Public hostname): `staging-admin.stationly.co.uk`
     (and `admin.stationly.co.uk` for prod — one app can cover both)
   - Policy: **Allow**, **Include → Emails →** your allowlist.
3. Verify in incognito: the URL shows the Cloudflare OTP wall before the console.

> OTP refuses non-allowlisted emails **after** the code step (not at email entry
> — that's by design, to avoid leaking which emails are valid).
>
> **Origin lockdown (recommended):** Access only protects traffic *through*
> Cloudflare; the raw VM IP is a back door. Lock `:80/:443` to Cloudflare IP
> ranges (`CLOUDFLARE_ACCESS.md` §5) — carefully, since the backend shares the
> staging VM (don't lock out the mobile API or SSH).

---

## 7. Rotating secrets

### Admin key (must change on BOTH sides)
```bash
NEW=$(openssl rand -hex 32)
# backend: set STATIONLY_ADMIN_KEY=$NEW → redeploy backend
# console: set ADMIN_KEY=$NEW in ~/stationly-admin/.env on the VM, then:
cd ~/stationly-admin && docker compose up -d        # picks up the new env
```
For a full release instead, set it in the VM `.env` and re-run the Deploy Action.

### Session secret (console only)
```bash
openssl rand -hex 32   # → SESSION_SECRET in the VM ~/stationly-admin/.env → docker compose up -d
```
Changing it logs everyone out.

### Console password
Edit `ADMIN_PASSWORD` in `~/stationly-admin/.env`, then `docker compose up -d`.

> Env changes take effect on the next `docker compose up -d` — no rebuild needed
> (env is injected at container start, not baked into the image).

---

## 7b. Health dashboard (`/health`)

The console continuously probes the platform from the app's point of view so a
break is caught before it blocks users. A **server-side scheduler** (started by
`instrumentation.ts` on boot, `experimental.instrumentationHook`) runs a full
cycle **every `HEALTHCHECK_INTERVAL_MS` (default 5 min)** — regardless of
whether anyone has the page open. Results live in an in-memory ring buffer
(last `HEALTHCHECK_HISTORY` per check, default 24h) for uptime % + status
strips; history resets on container restart.

What it probes each cycle:
- **Liveness** — `GET /` (no key) → `{ status: "…Online" }`.
- **App surface** — the real `/api/v1/*` endpoints the app calls
  (`/sdui/*`, `/modes`, `/lines/*`, `/stations/*`), attached with the public
  **`X-Stationly-Key`** (`STATIONLY_API_KEY`) exactly as the app does, with
  chained param discovery (modes → lines → stations) so params are real.
- **User-gated routes** — `/user/*`, probed at the auth gate (key, no Firebase
  token) → expect **401** = route alive, **zero side effects**.
- **Admin API** — `/admin/stats|users|waitlist|subscribed-stations|history` and
  the send pipeline (empty `POST` → `400` proves the admin key matches).
- **Waitlist form** — `POST /api/v1/waitlist/join` (the marketing site's form
  target, no key) with a malformed body → `400` at validation (no row created).
- **Syncer** — has no endpoint; **inferred** from whether `/modes`,
  `/lines/status` and `/admin/stats` caches are populated (the strong "down"
  signal) and from the newest line-status `lastUpdatedTime` (freshness). Because
  statuses only re-stamp on change (10-min poll; predictions 30s; station
  catalogue monthly), extreme staleness is reported `degraded`, never `down`.
- **TLS certs** — opens a raw TLS socket to the backend + website hosts and
  flags certs that are expired (`down`) or within `HEALTHCHECK_TLS_WARN_DAYS`
  (`degraded`) — an expired cert silently blocks the app.
- **Website** — `GET WEBSITE_URL` → 200.

Cross-cutting: an `up` probe slower than `HEALTHCHECK_SLOW_MS` is downgraded to
**degraded (slow)**; a `429` is **degraded (rate-limited)**, not down. Each
check tracks how long it's been in its current state + a consecutive-failure
count (shown as "since 15m (3×)").

> `POST /auth/forgot-password` is intentionally **not** probed (avoids sending
> reset emails / tripping its 3-per-15-min limiter).

**Alerting:** set `HEALTH_ALERT_WEBHOOK` to a Slack/Discord/generic incoming
webhook and the scheduler posts a `{text}` message whenever a check changes
state (outage + recovery by default; `HEALTH_ALERT_ON_DEGRADED=1` to also alert
on degraded). It only fires on the *edge* (status change), never repeats every
cycle, and never alert-storms on boot.

Config (all optional, see `.env.example`): `STATIONLY_API_KEY` (without it the
app-surface probes show `skipped`), `WEBSITE_URL`, `HEALTHCHECK_INTERVAL_MS`,
`HEALTHCHECK_TIMEOUT_MS`, `HEALTHCHECK_HISTORY`, `HEALTHCHECK_SEARCH`,
`HEALTHCHECK_LATLON`, `HEALTHCHECK_SLOW_MS`, `HEALTHCHECK_TLS_WARN_DAYS`,
`HEALTHCHECK_SYNCER_STALE_MS`. Confirm the scheduler is alive in the container:
`docker compose logs | grep '\[health\]'` → a "cycle complete" line every ~5 min.

---

## 8. Troubleshooting

**`403 Invalid admin authorization token`** — console `ADMIN_KEY` ≠ backend
`STATIONLY_ADMIN_KEY`. Verify against staging before deploying:
```bash
K=$(grep '^ADMIN_KEY=' ~/stationly-admin/.env | cut -d= -f2-)
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://staging-api.stationly.co.uk/api/v1/admin/notifications/send \
  -H "Authorization: Bearer $K" -H 'Content-Type: application/json' -d '{}'
# 400 = keys match (good) · 403 = mismatch
```

**Container health / status:**
```bash
cd ~/stationly-admin
docker compose ps                                   # want "Up (healthy)"
docker compose logs --tail 50
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4000/login   # want 200
```

**`502 Bad Gateway`** — the container isn't up or nginx points at the wrong
port. Check `docker compose ps`; ensure the container publishes `127.0.0.1:4000`.

**Deploy Action can't pull the image** — the VM isn't logged into GHCR
(`docker login ghcr.io …`, step 4.4) or the `<tag>` was never pushed by
`release.sh`.

**`manifest unknown` / wrong arch** — the image must be built on arm64 (the
Mac). Don't let CI build it; CI only deploys.

**Notification send `registration-token-not-registered`** — NOT a bug: the
send pipeline worked; the target device push token is stale (uninstalled /
expired / wrong Firebase project). Send to a live device to see `successCount`.

**`Missing 'X-Stationly-Key'`** on data screens — the backend predates the
`/admin/*` routes. Redeploy the backend.

**Redirect to `https://localhost:4000/…`** — proxy/host issue; ensure nginx
sends `Host $host` (the provided site does).

**Cloudflare Access not prompting** — confirm DNS is proxied (orange cloud) and
the Access app's destination hostname matches exactly. Test:
`curl -sI https://staging-admin.stationly.co.uk/` → expect a `302` to
`…cloudflareaccess.com/…`.

---

## 9. Local development

```bash
cp .env.example .env.local         # set ADMIN_PASSWORD, SESSION_SECRET, ADMIN_KEY
npm install
npm run dev                        # http://localhost:4000
```
Use `STATIONLY_ENV=staging` for local dev (shows the banner). To target a local
backend, set `BACKEND_URL=http://localhost:3000` and make sure that backend's
`STATIONLY_ADMIN_KEY` matches `ADMIN_KEY`. To test the actual production image
locally, use `./release.sh` (build + run) and decline the push.
