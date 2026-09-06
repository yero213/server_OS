#!/usr/bin/env bash
# Server OS — Phase 1 control-node bootstrap (Scenario A).
# Idempotent: safe to re-run; existing config is never destroyed.
# ONLY supported target: clean minimal Ubuntu Server 26.04 LTS, x86_64
# (Dell Inspiron 3542 Control/Application Node). Must run as root.
# Umbrel is NOT installed by this script and is NOT supported for the MVP.
#
# Scope: users, dirs, Node 22, Docker Engine, Caddy, Tailscale (installed
# + enabled ONLY, never joined), systemd units, firewall, frontend deploy.
# No App Store, no Immich, no remote mounts.
# Data-disk policy: this script never touches raw disks (see DATA_SAFETY.md).
# Tailscale policy: install + enable only; joining the tailnet is ALWAYS a
# manual admin step afterwards (see docs/TAILSCALE.md). Server OS keeps
# working fully when Tailscale is absent or offline.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/server-os}"
APP_DIR="/var/lib/serveros"
FRONTEND_DIR="/srv/serveros/frontend"
SERVICE_USER="serveros"

log() { echo "[bootstrap] $*"; }
have() { command -v "$1" >/dev/null 2>&1; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo bash installer/bootstrap-control.sh" >&2
  exit 1
fi
if [ ! -f /etc/os-release ]; then
  echo "Refusing: /etc/os-release missing (not Ubuntu Server 26.04?)" >&2
  exit 1
fi
# Scenario A gate: ONLY Ubuntu Server 26.04 LTS is supported for the MVP.
# shellcheck disable=SC1091
. /etc/os-release
log "OS: ${PRETTY_NAME:-unknown} (id=${ID:-?} version=${VERSION_ID:-?} arch=$(uname -m))"
if [ "${ID:-}" != "ubuntu" ] || [ "${VERSION_ID:-}" != "26.04" ]; then
  echo "Refusing: ONLY clean Ubuntu Server 26.04 LTS (x86_64) is supported." >&2
  echo "Detected: id=${ID:-?} version=${VERSION_ID:-?}. See docs/UBUNTU_INSTALL.md." >&2
  exit 1
fi
if [ "$(uname -m)" != "x86_64" ]; then
  echo "Refusing: ONLY x86_64 is supported for the MVP (detected: $(uname -m))." >&2
  exit 1
fi
if command -v dpkg >/dev/null 2>&1; then
  if [ "$(dpkg --print-architecture)" != "amd64" ]; then
    echo "Refusing: dpkg architecture is not amd64 (detected: $(dpkg --print-architecture))." >&2
    exit 1
  fi
fi
log "Platform gate passed: Ubuntu Server 26.04 LTS x86_64"

# 1. Service user (idempotent).
if id -u "$SERVICE_USER" >/dev/null 2>&1; then
  log "user $SERVICE_USER exists, keeping as-is"
else
  useradd --system --home-dir "$APP_DIR" --create-home --shell /usr/sbin/nologin "$SERVICE_USER"
  log "created system user $SERVICE_USER"
fi

# 2. Directories (idempotent, ownership preserved).
mkdir -p "$APP_DIR" "$FRONTEND_DIR" /etc/serveros /run/serveros
chown "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
chmod 0750 "$APP_DIR"
log "directories ready"

# 3. Node.js 22 LTS via NodeSource (skip when already >= 22).
NEED_NODE=1
if have node; then
  MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [ "$MAJOR" -ge 22 ] 2>/dev/null; then NEED_NODE=0; fi
fi
if [ "$NEED_NODE" -eq 1 ]; then
  log "installing Node.js 22 LTS (NodeSource)"
  apt-get update
  apt-get install -y ca-certificates curl gnupg
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update
  apt-get install -y nodejs
else
  log "node $(node --version) present, skipping NodeSource setup"
fi

# 4. Docker Engine via official Docker apt repo (skip when present).
# Uses download.docker.com for Ubuntu ($VERSION_CODENAME=resolute on 26.04).
# Installs the engine + compose plugin ONLY; no app containers are deployed.
if have docker; then
  log "docker present ($(docker --version 2>/dev/null || echo unknown)), skipping repo setup"
else
  log "installing Docker Engine (official repo)"
  apt-get update
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  CODENAME="$(grep -E '^VERSION_CODENAME=' /etc/os-release | cut -d= -f2)"
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $CODENAME stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi
usermod -aG docker "$SERVICE_USER" || true

# 5. Caddy via official Cloudsmith repo (skip when present).
# NOTE: the filenames/keys below containing "debian" are Caddy upstream
# naming (per Caddy docs for Ubuntu) — NOT a Debian-OS assumption.
# Target remains Ubuntu Server 26.04 (resolute) only.
if have caddy; then
  log "caddy present, skipping repo setup"
else
  log "installing Caddy (official repo)"
  apt-get update
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

# 6. Tailscale via official package server (skip when present).
# Remote-admin plane for off-LAN SSH/access. Install + enable ONLY:
# this script NEVER joins the tailnet (no join command, no auth key),
# so unattended runs stay non-interactive. The admin joins manually
# afterwards (see docs/TAILSCALE.md). Server OS works fully with
# Tailscale absent or offline; LAN behaviour is unchanged.
if have tailscale; then
  log "tailscale present ($(tailscale version 2>/dev/null | head -n 1 || echo unknown)), skipping repo setup"
else
  log "installing Tailscale (official package server)"
  apt-get update
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /usr/share/keyrings
  TS_CODENAME="$(grep -E '^VERSION_CODENAME=' /etc/os-release | cut -d= -f2)"
  curl -fsSL "https://pkgs.tailscale.com/stable/ubuntu/${TS_CODENAME}.noarmor.gpg" \
    -o /usr/share/keyrings/tailscale-archive-keyring.gpg
  curl -fsSL "https://pkgs.tailscale.com/stable/ubuntu/${TS_CODENAME}.tailscale-keyring.list" \
    > /etc/apt/sources.list.d/tailscale.list
  apt-get update
  apt-get install -y tailscale
fi
systemctl enable --now tailscaled

# 7. Backend build + install (expects this repo at REPO_DIR).
# Full install (not --omit=dev): the build needs devDependencies
# (typescript); runtime uses dist/ only, the extra packages stay inert.
if [ ! -f "$REPO_DIR/backend/package.json" ]; then
  echo "Repo not found at $REPO_DIR (set REPO_DIR=). Cloned repo goes there." >&2
  exit 1
fi
log "building backend from $REPO_DIR"
cd "$REPO_DIR"
npm install
npm run build --workspace @serveros/backend
mkdir -p /opt/server-os
# Fresh deploy dir (rm first: plain cp -r would nest dist/ on re-run).
rm -rf /opt/server-os/backend-dist
cp -r "$REPO_DIR/backend/dist" /opt/server-os/backend-dist
# Schema migrations MUST ship with the bundle as a SIBLING of backend-dist:
# dist/db.js resolves ../drizzle/0001_init.sql, i.e. one level UP from
# backend-dist (see backend/src/db.ts; same layout the checkout uses).
# Whole dir (not one file) so later migrations deploy automatically.
rm -rf /opt/server-os/drizzle
cp -r "$REPO_DIR/backend/drizzle" /opt/server-os/drizzle
cp "$REPO_DIR/backend/package.json" /opt/server-os/backend-package.json
# Artifact-scoped ownership ONLY: never chown/chmod the repo checkout
# itself (REPO_DIR may equal /opt/server-os; the checkout must stay
# usable for non-root preflight/git).
chown -R "root:$SERVICE_USER" /opt/server-os/backend-dist /opt/server-os/backend-package.json
chmod -R 0750 /opt/server-os/backend-dist /opt/server-os/backend-package.json
# The checkout stays world-traversable/readable (public code, no secrets).
chmod 0755 "$REPO_DIR"

# 8. Frontend static deploy.
log "deploying frontend to $FRONTEND_DIR"
cd "$REPO_DIR/frontend"
npm install
npm run build
rm -rf "$FRONTEND_DIR.new"
cp -r build "$FRONTEND_DIR.new"
chown -R root:root "$FRONTEND_DIR.new"
chmod -R 0755 "$FRONTEND_DIR.new"
rm -rf "$FRONTEND_DIR.old"
[ -d "$FRONTEND_DIR" ] && mv "$FRONTEND_DIR" "$FRONTEND_DIR.old" || true
mv "$FRONTEND_DIR.new" "$FRONTEND_DIR"

# 9. systemd units (from repo, daemon-reload, enable --now).
log "installing systemd units"
cp "$REPO_DIR/installer/systemd/serveros-api.service" /etc/systemd/system/
cp "$REPO_DIR/installer/systemd/serveros-helper.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now serveros-helper.service
systemctl enable --now serveros-api.service

# 10. Caddy reverse proxy (template → validate → reload).
log "configuring Caddy"
cp "$REPO_DIR/installer/caddy/Caddyfile.tmpl" /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl enable --now caddy
systemctl reload caddy || systemctl restart caddy

# 11. Firewall (separate script, idempotent).
if ! have ufw; then
  log "installing ufw (missing on minimal images)"
  apt-get update
  apt-get install -y ufw
fi
bash "$REPO_DIR/installer/ufw-control.sh"

log "done. Verify:"
log "  curl -k https://server.local/api/v1/health"
log "  systemctl status serveros-api serveros-helper caddy --no-pager"
