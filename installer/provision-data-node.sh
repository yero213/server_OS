#!/usr/bin/env bash
# Server OS — Phase 1 data-node provisioning (desktop, headless).
# ONLY supported target: clean minimal Ubuntu Server 26.04 LTS, x86_64.
# DETECT-ONLY for the data disk: reports identity/size/filesystem and
# NEVER modifies it. If no usable filesystem exists, prints the manual
# preparation notice and exits 0. No NFS export for the data disk in Phase 1.
# Tailscale is installed + enabled ONLY (remote SSH management); joining
# the tailnet is ALWAYS a manual admin step afterwards (see
# docs/TAILSCALE.md). NFS stays the LAN-only data plane in the MVP.
# Must run as root on the desktop. Idempotent.
set -euo pipefail

log() { echo "[data-node] $*"; }
have() { command -v "$1" >/dev/null 2>&1; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root on the data node." >&2
  exit 1
fi
if [ ! -f /etc/os-release ]; then
  echo "Refusing: /etc/os-release missing (not Ubuntu Server 26.04?)" >&2
  exit 1
fi
# shellcheck disable=SC1091
. /etc/os-release
log "OS: ${PRETTY_NAME:-unknown} (id=${ID:-?} version=${VERSION_ID:-?} arch=$(uname -m))"
if [ "${ID:-}" != "ubuntu" ] || [ "${VERSION_ID:-}" != "26.04" ]; then
  echo "Refusing: ONLY clean Ubuntu Server 26.04 LTS (x86_64) is supported." >&2
  exit 1
fi
if [ "$(uname -m)" != "x86_64" ]; then
  echo "Refusing: ONLY x86_64 is supported for the MVP (detected: $(uname -m))." >&2
  exit 1
fi

log "installing base packages (nfs server, smart tools, avahi)"
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  nfs-kernel-server smartmontools avahi-daemon openssh-server ufw

systemctl enable --now avahi-daemon
systemctl enable --now smartd 2>/dev/null || log "smartd not available, continuing"

# Tailscale (official package server, install + enable ONLY, never joined
# here — same policy as the control node, see docs/TAILSCALE.md).
if have tailscale; then
  log "tailscale present, skipping repo setup"
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

# Read-only inventory of block devices (never writes).
log "block device inventory (read-only):"
lsblk -o NAME,PATH,SIZE,MODEL,SERIAL,TRAN,TYPE,FSTYPE,MOUNTPOINT,UUID || true
echo
log "filesystem signatures (read-only):"
blkid || true
echo

# Heuristic: the ~931 GiB rotating disk is the intended future media disk.
# Identification is by SIZE + TRAN only, for REPORTING — nothing is done with it.
CANDIDATE="$(lsblk -rbn -o PATH,SIZE,TYPE | awk '$3=="disk" && $2>900000000000 && $2<1050000000000 {print $1}' | head -n 1 || true)"
if [ -z "$CANDIDATE" ]; then
  log "no ~1TB disk detected; nothing to report (this is fine for Phase 1)"
  exit 0
fi
log "candidate media disk (REPORT ONLY, untouched): $CANDIDATE"
FS="$(blkid -o value -s TYPE "$CANDIDATE" 2>/dev/null || true)"
if [ -z "$FS" ]; then
  echo "NOTICE: $CANDIDATE has no detectable filesystem."
  echo "Manual preparation by the administrator is required before any later phase."
  echo "Phase 1 creates no filesystem, no export and no mount for this disk."
else
  log "detected filesystem type on $CANDIDATE: $FS (left untouched, no mount created)"
fi

if [ -n "${LAPTOP_IP:-}" ]; then
  bash "$(dirname "$0")/ufw-datanode.sh" "$LAPTOP_IP"
else
  log "LAPTOP_IP unset: skipping firewall, run installer/ufw-datanode.sh <laptop-ip> manually"
fi
log "Phase 1 data-node provisioning complete (detect-only)."
