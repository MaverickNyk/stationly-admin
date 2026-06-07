#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# 1. Check for .env.local
if [ ! -f .env.local ]; then
  echo "⚠️  .env.local not found!"
  if [ -f .env.example ]; then
    echo "Creating .env.local from .env.example..."
    cp .env.example .env.local
    echo "👉 Please edit .env.local and fill in your local secrets before running."
  else
    echo "❌ Error: .env.example not found. Cannot create .env.local."
    exit 1
  fi
  exit 0
fi

echo "🚀 Stationly Admin Console - Local Runner"
echo "----------------------------------------"
echo "1) Run Local Development (npm run dev - hot reloading)"
echo "2) Run Local Docker Container (production build test)"
read -r -p "Choose an option [1]: " opt
opt=${opt:-1}

case "$opt" in
  1)
    echo "Starting Next.js development server on port 4000..."
    npm run dev
    ;;
  2)
    echo "Building and running Docker container locally..."
    IMAGE="stationly-admin-local"
    docker build -t "$IMAGE" .
    echo "Running container on http://localhost:4000..."
    docker run --rm --env-file .env.local -p 4000:4000 "$IMAGE"
    ;;
  *)
    echo "Invalid option."
    exit 1
    ;;
esac
