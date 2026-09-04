#!/usr/bin/env bash
# UFW firewall for the DATA node (desktop). Idempotent.
# Usage: sudo bash ufw-datanode.sh <laptop-ip>
# Only the laptop IP may reach SSH (22) and NFS (2049). All other
# incoming traffic is denied. No ports are exposed to the internet.
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

ufw --force enable
ufw default deny incoming
ufw default allow outgoing
allow_from_once "$LAPTOP_IP" 22
allow_from_once "$LAPTOP_IP" 2049
echo "[ufw] data node firewall ready (trusted peer: $LAPTOP_IP)"
ufw status verbose
