#!/usr/bin/env bash
# Server OS — Phase 1 control-node bootstrap (laptop).
# Idempotent: safe to re-run; existing config is never destroyed.
# Target: minimal Ubuntu Server 24.04 LTS x86_64. Must run as root.
#
# Scope: users, dirs, Node 22, Docker Engine, Caddy, systemd units,
# firewall, frontend deploy. No App Store, no Immich, no remote mounts.
# Data-disk policy: this script never touches raw disks (see DATA_SAFETY.md).
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
  echo "Refusing: /etc/os-release missing (not Ubuntu Server?)" >&2
  exit 1
fi
log "OS: $(grep -E '^PRETTY_NAME=' /etc/os-release | cut -d= -f2-)"

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

# 6. Backend build + install (expects this repo at REPO_DIR).
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
cp -r "$REPO_DIR/backend/dist" /opt/server-os/backend-dist
cp "$REPO_DIR/backend/package.json" /opt/server-os/backend-package.json
chown -R "root:$SERVICE_USER" /opt/server-os
chmod -R 0750 /opt/server-os

# 7. Frontend static deploy.
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

# 8. systemd units (from repo, daemon-reload, enable --now).
log "installing systemd units"
cp "$REPO_DIR/installer/systemd/serveros-api.service" /etc/systemd/system/
cp "$REPO_DIR/installer/systemd/serveros-helper.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now serveros-helper.service
systemctl enable --now serveros-api.service

# 9. Caddy reverse proxy (template → validate → reload).
log "configuring Caddy"
cp "$REPO_DIR/installer/caddy/Caddyfile.tmpl" /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl enable --now caddy
systemctl reload caddy || systemctl restart caddy

# 10. Firewall (separate script, idempotent).
if ! have ufw; then
  log "installing ufw (missing on minimal images)"
  apt-get update
  apt-get install -y ufw
fi
bash "$REPO_DIR/installer/ufw-control.sh"

log "done. Verify:"
log "  curl -k https://server.local/api/v1/health"
log "  systemctl status serveros-api serveros-helper caddy --no-pager"
