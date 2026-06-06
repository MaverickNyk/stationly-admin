# Admin Console — going live on staging

> This page has moved. The canonical, up-to-date runbook (deploy, nginx + TLS,
> pm2, DNS, secret rotation, troubleshooting, local dev) is:
>
> **→ [docs/OPERATIONS.md](docs/OPERATIONS.md)**
>
> For the Cloudflare Access lockdown see **[CLOUDFLARE_ACCESS.md](CLOUDFLARE_ACCESS.md)**,
> and for the overall design see **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## TL;DR

```bash
# 1. backend first (so /admin/* routes exist)
cd stationly-backend && ./.scripts/staging_deploy.sh
# 2. console
cd stationly-backend/admin-console && ./staging_deploy.sh
# 3. one-time: DNS (proxied) → staging-admin.stationly.co.uk, nginx + certbot, pm2 startup
```
