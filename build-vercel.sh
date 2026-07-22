#!/usr/bin/env bash
# Build the Next.js site locally and prepare it for Vercel deployment.
# Next.js on Vercel is auto-detected — this script verifies the build works.
set -euo pipefail
cd "$(dirname "$0")"
umask 002

echo "[1/2] installing dependencies"
bun install

echo "[2/2] running next build"
bun run build

echo "Build complete — ready for Vercel deployment."
