#!/usr/bin/env bash
# UFW firewall for the CONTROL node (laptop). Idempotent.
# Allows: OpenSSH (LAN use), HTTP/HTTPS. Everything else default-deny incoming.
set -euo pipefail

allow_once() {
  local rule="$1"
  # shellcheck disable=SC2086
  if ufw status | grep -qF "$rule"; then
    echo "[ufw] already present: $rule"
  else
    ufw allow $rule
  fi
}

ufw --force enable
ufw default deny incoming
ufw default allow outgoing
allow_once "22/tcp"
allow_once "80/tcp"
allow_once "443/tcp"
echo "[ufw] control node firewall ready"
ufw status verbose
