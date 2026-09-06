#!/usr/bin/env bash
# UFW firewall for the CONTROL node (laptop). Idempotent.
# Allows: OpenSSH (LAN use), HTTP/HTTPS. Everything else default-deny incoming.
# Tailscale (see docs/TAILSCALE.md):
# - 41641/udp is open for direct WireGuard peer connections (official
#   Tailscale firewall guidance; without it only DERP relay over
#   outbound 443 works — slower but functional).
# - Deliberately NO broad "allow in on tailscale0" rule: tailnet clients
#   reach SSH/web through the same 22/80/443 rules as LAN clients, so LAN
#   behaviour is unchanged and Server OS works with Tailscale absent.
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
allow_once "41641/udp"
echo "[ufw] control node firewall ready"
ufw status verbose
