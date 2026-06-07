#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Stationly Admin Console — build & (optionally) push the image (LOCAL, by hand)
# -----------------------------------------------------------------------------
# Builds the production image locally (arm64, matching the VMs), tags it with
# the current git short SHA, lets you test it, and pushes to GHCR ONLY if you
# confirm. Deploy is separate — trigger the "Deploy" GitHub Action with the SHA.
#
# Fast inner loop (no push): `npm run dev` on :4000, or build+run as below.
# Prereqs: Docker Desktop running, and `docker login ghcr.io` done once.
# =============================================================================

cd "$(dirname "$0")"

# Ensure we are on the main branch
BRANCH="$(git branch --show-current)"
if [ "$BRANCH" != "main" ]; then
  echo "❌ Error: publish_image.sh can only be run on the 'main' branch."
  echo "You are currently on: '$BRANCH'"
  exit 1
fi

IMAGE="ghcr.io/mavericknyk/stationly-admin"
SHA="$(git rev-parse --short HEAD)"
STAMP="$(date -u +%Y%m%d-%H%M)"          # UTC build time, sortable
TAG="$STAMP-$SHA"                        # e.g. 20260607-1430-03cfc58
if [ -n "$(git status --porcelain)" ]; then
  TAG="$TAG-dirty"                       # flag uncommitted changes
  echo "⚠️  Working tree has uncommitted changes — tagging :$TAG."
fi

echo "🔨 Building $IMAGE:$TAG ..."
docker build -t "$IMAGE:$TAG" -t "$IMAGE:latest" .

cat <<EOF

🧪 Test this exact image locally before pushing:
   docker run --rm --env-file .env.local -p 4000:4000 $IMAGE:$TAG
   → open http://localhost:4000/login

EOF

read -r -p "Push $IMAGE:$TAG to GHCR? [y/N] " ans
case "$ans" in
  y|Y)
    docker push "$IMAGE:$TAG"
    docker push "$IMAGE:latest"
    echo "✅ Pushed $IMAGE:$TAG"
    echo "👉 Deploy: GitHub → Actions → Deploy → Run workflow → pick env, tag = $TAG"
    ;;
  *)
    echo "↩︎  Not pushed. Image is built locally as $IMAGE:$TAG for testing."
    ;;
esac
