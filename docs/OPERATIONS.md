# Admin Console — Operations Runbook

Canonical runbook for deploying and operating the admin console. No secrets in
this file — placeholders: `<STAGING_HOST>` (the staging server),
`<SSH_KEY>` (path to the deploy SSH key), `<ADMIN_KEY>`, `<PASSWORD>`.

The deploy scripts (`staging_deploy.sh`, `.scripts/staging_deploy.sh`) are
**gitignored** by repo convention (`staging_*.sh`) because they carry the host
and key path. They live only on operators' machines.

---

## 1. Config — `admin-console/.env.local` (gitignored)

```ini
STATIONLY_ENV=staging                 # staging | production (fixes the target env)
ADMIN_PASSWORD=<PASSWORD>             # console login
SESSION_SECRET=<random hex>          # openssl rand -hex 32  (signs the session cookie)
STAGING_BACKEND_URL=https://staging-api.stationly.co.uk   # optional; default is this
STAGING_ADMIN_KEY=<ADMIN_KEY>        # MUST equal the backend's staging STATIONLY_ADMIN_KEY
# Once Cloudflare Access gates the admin API path:
STAGING_CF_ACCESS_CLIENT_ID=…
STAGING_CF_ACCESS_CLIENT_SECRET=…
```

Production uses the `PROD_*` equivalents and `STATIONLY_ENV=production`.

> **Golden rule:** `STAGING_ADMIN_KEY` (console) must equal `STATIONLY_ADMIN_KEY`
> (backend) for the same environment. If they drift you get
> `403 Invalid admin authorization token`.

### Where the live values actually run
Editing `.env.local` changes **nothing live** until you redeploy. The running
processes read:
- Console → `~/stationly-admin/.env.production` (written by the deploy script)
- Backend → `~/stationly-backend/.env` (written by the backend deploy script)

---

## 2. First-time setup (once per environment)

1. **Deploy the backend first** so the `/admin/*` routes exist (otherwise the
   console's data screens return `Missing 'X-Stationly-Key'`).
2. **DNS:** add a **proxied** record `staging-admin.stationly.co.uk → <STAGING_HOST>`.
3. **Deploy the console** (section 3).
4. **nginx + TLS** (section 4).
5. **pm2 reboot persistence** (section 5).
6. **Cloudflare Access** before sharing the URL — see `../CLOUDFLARE_ACCESS.md`.

---

## 3. Deploy

```bash
# Backend (also serves the mobile API; graceful pm2 reload + health check)
cd stationly-backend && ./.scripts/staging_deploy.sh

# Console (standalone bundle → pm2 "stationly-admin" on :4000)
cd stationly-backend/admin-console && ./staging_deploy.sh
```

The website deploy script (`StationlyUI/staging_deploy.sh`) also chains the
console deploy at the end; `--web-only` skips it.

What the console deploy does: builds the Next standalone bundle, folds in
`static`/`public`, writes a chmod-600 `.env.production` on the server (from
`.env.local`, forcing the real backend URL), restarts the `stationly-admin` pm2
process, and health-checks `http://127.0.0.1:4000/login`.

---

## 4. nginx + TLS (once)

⚠️ The committed `deploy/nginx-staging-admin.conf` is the *final* (HTTPS) shape.
Because it declares `listen 443 ssl` before a cert exists, the first `nginx -t`
would fail. Use **HTTP-only first, let certbot add HTTPS**:

```bash
# [server] put an HTTP-only block first (proxy in the :80 server), enable it:
sudo ln -s /etc/nginx/sites-available/staging-admin.stationly.co.uk /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
# certbot obtains the cert AND rewrites the file to add the 443 block + redirect:
sudo certbot --nginx -d staging-admin.stationly.co.uk
sudo nginx -t && sudo systemctl reload nginx
```

The minimal HTTP-only block (proxy to the Next process):
```nginx
upstream stationly_admin { server 127.0.0.1:4000; }
server {
    listen 80;
    server_name staging-admin.stationly.co.uk;
    add_header X-Robots-Tag "noindex, nofollow" always;
    location / {
        proxy_pass http://stationly_admin;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```
Cloudflare note: keep the zone SSL/TLS mode at **Full (strict)**; certbot's
HTTP-01 challenge passes through Cloudflare on :80.

---

## 5. pm2 reboot persistence (once)

```bash
pm2 save
pm2 startup   # run the sudo line it prints, then: pm2 save
```
Both `stationly-admin` and `stationly-backend` then auto-resurrect on reboot.

---

## 6. Rotating secrets

### Admin key (must change on BOTH sides)
```bash
NEW=$(openssl rand -hex 32)
# backend: set STATIONLY_ADMIN_KEY=$NEW in stationly-backend/.env  → redeploy backend
# console: set STAGING_ADMIN_KEY=$NEW in admin-console/.env.local  → redeploy console
```
(For a quick rotation you can patch `~/stationly-backend/.env` on the server and
`pm2 reload stationly-backend --update-env`, but keep the local `.env` in sync
so the next full deploy doesn't revert it.) If the same value is used for prod
(GitHub secret `STATIONLY_ADMIN_KEY`), rotate that too and redeploy prod.

### Session secret (console only)
```bash
openssl rand -hex 32   # → SESSION_SECRET in .env.local → redeploy console
```
Changing it logs everyone out.

### Console password
Edit `ADMIN_PASSWORD` in `admin-console/.env.local`, **save**, then redeploy.

---

## 7. Troubleshooting

**`403 Invalid admin authorization token`** — the console's `STAGING_ADMIN_KEY`
≠ the backend's `STATIONLY_ADMIN_KEY`. Verify the console key against staging
before deploying:
```bash
K=$(grep '^STAGING_ADMIN_KEY=' admin-console/.env.local | cut -d= -f2-)
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://staging-api.stationly.co.uk/api/v1/admin/notifications/send \
  -H "Authorization: Bearer $K" -H 'Content-Type: application/json' -d '{}'
# 400 = keys match (good) · 403 = mismatch (fix before deploying)
```

**Password/secret change "not taking"** — two causes: (a) the value wasn't
**saved** to `.env.local`, or (b) you didn't **redeploy** (the server runs from
`.env.production`, regenerated only at deploy time). Don't paste an old full copy
over `.env.local` — it can silently revert the key/secret.

**`Missing 'X-Stationly-Key'`** on the data screens — the staging **backend**
predates the `/admin/*` routes. Redeploy the backend.

**Redirect to `https://localhost:4000/…`** — proxy/host issue; `middleware.ts`
builds redirects from the forwarded host. Ensure nginx sends `Host $host` (it
does in the provided config).

**`502 Bad Gateway`** — the Next process isn't up / wrong port:
```bash
pm2 status stationly-admin
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4000/login   # want 200
pm2 logs stationly-admin --lines 50
```

**Mobile API health check shows 403** after a backend deploy — that's normal:
the check uses a fake `X-Stationly-Key`; 401/403/200 all mean "server is up".

---

## 8. Local development

```bash
cd admin-console
cp .env.local.example .env.local   # set ADMIN_PASSWORD, SESSION_SECRET, STAGING_ADMIN_KEY
npm install
npm run dev                        # http://localhost:4000
```
There is no `local` env. To point local dev at a locally-running backend, set
`STAGING_BACKEND_URL=http://localhost:3000` and make sure that backend's
`STATIONLY_ADMIN_KEY` matches `STAGING_ADMIN_KEY` (restart it after key changes).
Otherwise it targets the real staging API.
