#!/usr/bin/env bash
#
# GreenMirror — Raspberry Pi backend installer (idempotent).
#
# Safe to run more than once. It installs system + Node tooling, installs the
# backend's npm dependencies, and verifies that the required secrets are in
# place. It never overwrites secrets and never starts the service while a
# required secret is missing.
#
# Usage (from anywhere on the Pi):
#   bash deployment/raspberry-pi/install.sh
#
set -euo pipefail

# ─── Locate the repo ──────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
RPI_DIR="${REPO_ROOT}/raspberry-pi"
ECOSYSTEM="${SCRIPT_DIR}/ecosystem.config.cjs"
APP_NAME="greenmirror-backend"

# Use sudo only if present and not already root.
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  SUDO="$(command -v sudo || true)"
fi

echo "==> GreenMirror Pi installer"
echo "    repo:    ${REPO_ROOT}"
echo "    backend: ${RPI_DIR}"
echo

# ─── 1. System packages ───────────────────────────────────────────────────────
echo "==> Updating apt package lists..."
$SUDO apt-get update -y

echo "==> Installing base packages (git, curl, build tools)..."
$SUDO apt-get install -y git curl ca-certificates build-essential

# ─── 2. Node.js LTS (only if missing or too old) ──────────────────────────────
NEED_NODE=1
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -v | sed 's/v\([0-9]*\).*/\1/')"
  if [ "${NODE_MAJOR:-0}" -ge 18 ]; then
    echo "==> Node.js $(node -v) already installed — skipping."
    NEED_NODE=0
  else
    echo "==> Node.js $(node -v) is too old (need >= 18) — upgrading to LTS."
  fi
fi
if [ "$NEED_NODE" -eq 1 ]; then
  echo "==> Installing Node.js LTS via NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_lts.x | $SUDO -E bash -
  $SUDO apt-get install -y nodejs
fi
echo "    node $(node -v) · npm $(npm -v)"

# ─── 3. PM2 (only if missing) ─────────────────────────────────────────────────
if command -v pm2 >/dev/null 2>&1; then
  echo "==> PM2 $(pm2 -v) already installed — skipping."
else
  echo "==> Installing PM2 globally..."
  $SUDO npm install -g pm2
fi

# ─── 4. Backend dependencies ──────────────────────────────────────────────────
echo "==> Installing backend dependencies (npm install)..."
cd "${RPI_DIR}"
if [ -f package-lock.json ]; then
  npm ci || npm install
else
  npm install
fi

# ─── 5. Verify secrets (never created or overwritten by this script) ──────────
ENV_FILE="${RPI_DIR}/.env"
SA_FILE="${RPI_DIR}/firebase-service-account.json"
MISSING=0

echo
echo "==> Checking required secrets..."
if [ -f "${ENV_FILE}" ]; then
  echo "    ✅ .env present"
else
  echo "    ❌ .env MISSING"
  MISSING=1
fi

# The service account JSON is optional for the server to *run* (it falls back to
# in-memory only), but it is required for Firestore writes in production, so we
# treat it as required for a complete deployment.
if [ -f "${SA_FILE}" ]; then
  echo "    ✅ firebase-service-account.json present"
else
  echo "    ❌ firebase-service-account.json MISSING"
  MISSING=1
fi

# ─── 6. Next steps / start ────────────────────────────────────────────────────
echo
if [ "$MISSING" -ne 0 ]; then
  cat <<EOF
==> Setup is incomplete — required secrets are missing.

    Add the missing file(s) (these are git-ignored and must be copied in by hand):

      1. ${ENV_FILE}
         cp "${RPI_DIR}/.env.example" "${ENV_FILE}"   # then edit values

      2. ${SA_FILE}
         Copy your Firebase service-account JSON to that exact path.

    Then re-run this installer, or start the backend manually:

      pm2 start "${ECOSYSTEM}"

    PM2 was NOT started because required secrets are missing.
EOF
  exit 0
fi

echo "==> All required secrets present."
if pm2 describe "${APP_NAME}" >/dev/null 2>&1; then
  echo "    '${APP_NAME}' is already managed by PM2 — leaving it running."
  echo "    To apply new code/config, run: bash ${SCRIPT_DIR}/update.sh"
else
  echo "==> Starting ${APP_NAME} with PM2..."
  pm2 start "${ECOSYSTEM}"
  pm2 save
  echo
  echo "    To start the backend automatically on boot, run the command that"
  echo "    'pm2 startup' prints (one-time, needs sudo):"
  echo "      pm2 startup"
fi

echo
echo "==> Done. Check status with:  pm2 status"
echo "                    logs with:  pm2 logs ${APP_NAME}"
