# Admin Console — going live on staging

> This page has moved. The canonical, up-to-date runbook (build, deploy via
> GHCR + GitHub Actions, nginx + TLS, DNS, secret rotation, troubleshooting,
> local dev) is:
>
> **→ [docs/OPERATIONS.md](docs/OPERATIONS.md)**
>
> For the Cloudflare Access lockdown see **[CLOUDFLARE_ACCESS.md](CLOUDFLARE_ACCESS.md)**,
> and for the overall design see **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## TL;DR (release → deploy)

```bash
# 1. Build, test, and push the image (local; pushes on your "y")
./release.sh                         # → ghcr.io/mavericknyk/stationly-admin:<tag>

# 2. Deploy to staging — GitHub → Actions → "Deploy" → Run workflow
#    environment = staging, tag = <tag from release.sh>

# 3. Verify, then promote the SAME tag to prod
#    GitHub → Actions → "Deploy" → environment = prod, tag = <tag from release.sh>
```

One-time per VM (see OPERATIONS.md §4–5): Docker + `docker login ghcr.io`,
`~/stationly-admin/.env` (chmod 600) + `docker-compose.yml`, the nginx site
(reusing the existing Let's Encrypt cert), proxied DNS, and the GitHub
Environment secrets (`SSH_HOST` / `SSH_USER` / `SSH_KEY`).
