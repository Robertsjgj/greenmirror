#!/usr/bin/env bash
#
# GreenMirror — Raspberry Pi backend updater (safe).
#
# Pulls the latest code, reinstalls dependencies only when they changed, runs
# syntax checks BEFORE touching the running process, then reloads the PM2 app.
# If anything fails the syntax check, the running backend is left untouched.
#
# Usage (from anywhere on the Pi):
#   bash deployment/raspberry-pi/update.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
RPI_DIR="${REPO_ROOT}/raspberry-pi"
ECOSYSTEM="${SCRIPT_DIR}/ecosystem.config.cjs"
APP_NAME="greenmirror-backend"

echo "==> GreenMirror Pi update"
echo "    repo: ${REPO_ROOT}"
echo

# ─── 1. Pull latest code ──────────────────────────────────────────────────────
echo "==> git pull..."
BEFORE="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
git -C "${REPO_ROOT}" pull --ff-only
AFTER="$(git -C "${REPO_ROOT}" rev-parse HEAD)"

if [ "${BEFORE}" = "${AFTER}" ]; then
  echo "    Already up to date (${AFTER})."
else
  echo "    Updated ${BEFORE} -> ${AFTER}"
fi

cd "${RPI_DIR}"

# ─── 2. Install dependencies only if package files changed (or none present) ──
NEED_INSTALL=0
if [ ! -d node_modules ]; then
  echo "==> node_modules missing — dependencies will be installed."
  NEED_INSTALL=1
elif [ "${BEFORE}" != "${AFTER}" ] && \
     git -C "${REPO_ROOT}" diff --name-only "${BEFORE}" "${AFTER}" -- \
       raspberry-pi/package.json raspberry-pi/package-lock.json | grep -q .; then
  echo "==> package.json / lockfile changed — reinstalling dependencies."
  NEED_INSTALL=1
fi

if [ "${NEED_INSTALL}" -eq 1 ]; then
  if [ -f package-lock.json ]; then
    npm ci || npm install
  else
    npm install
  fi
else
  echo "==> Dependencies unchanged — skipping npm install."
fi

# ─── 3. Syntax checks (BEFORE restarting anything) ────────────────────────────
echo "==> Running syntax checks..."
node -c server.js
node -c firestore.js
node -c snapshot.js
echo "    ✅ syntax OK"

# ─── 4. Reload PM2 app if it exists, else explain how to start it ─────────────
echo
if command -v pm2 >/dev/null 2>&1 && pm2 describe "${APP_NAME}" >/dev/null 2>&1; then
  echo "==> Reloading ${APP_NAME}..."
  pm2 reload "${ECOSYSTEM}" --update-env || pm2 restart "${APP_NAME}"
  pm2 save
else
  cat <<EOF
==> ${APP_NAME} is not running under PM2 yet.
    Start it with:

      pm2 start "${ECOSYSTEM}"
      pm2 save
EOF
fi

# ─── 5. Status ────────────────────────────────────────────────────────────────
echo
if command -v pm2 >/dev/null 2>&1; then
  pm2 status
fi
