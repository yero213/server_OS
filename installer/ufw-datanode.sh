#!/usr/bin/env bash
# UFW firewall for the DATA node (desktop). Idempotent.
# Usage: sudo bash ufw-datanode.sh <laptop-ip>
# Only the laptop IP may reach SSH (22) and NFS (2049). All other
# incoming traffic is denied. No ports are exposed to the internet.
# Tailscale (see docs/TAILSCALE.md):
# - 41641/udp is open for direct WireGuard peer connections (official
#   Tailscale firewall guidance; narrow single port, documented here).
# - SSH (22) is reachable via the tailnet interface ONLY, port-scoped
#   (no broad "allow everything from tailscale" rule). LAN NFS/SSH rules
#   are unchanged; NFS stays LAN-only in the MVP.
set -euo pipefail

LAPTOP_IP="${1:-${LAPTOP_IP:-}}"
if [ -z "$LAPTOP_IP" ]; then
  echo "Usage: $0 <laptop-ip>" >&2
  exit 1
fi

allow_from_once() {
  local ip="$1" port="$2"
  if ufw status | grep -qF "$ip" | grep -qF "$port"; then
    echo "[ufw] already present: $ip -> $port"
  else
    ufw allow from "$ip" to any port "$port"
  fi
}

rule_once() {
  local match="$1"
  shift
  if ufw status | grep -qF "$match"; then
    echo "[ufw] already present: $match"
  else
    ufw "$@"
  fi
}

ufw --force enable
ufw default deny incoming
ufw default allow outgoing
allow_from_once "$LAPTOP_IP" 22
allow_from_once "$LAPTOP_IP" 2049
rule_once "41641/udp" allow 41641/udp
rule_once "on tailscale0" allow in on tailscale0 to any port 22
echo "[ufw] data node firewall ready (trusted peer: $LAPTOP_IP)"
ufw status verbose
