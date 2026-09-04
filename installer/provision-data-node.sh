#!/usr/bin/env bash
# Server OS — Phase 1 data-node provisioning (desktop, headless).
# DETECT-ONLY for the data disk: reports identity/size/filesystem and
# NEVER modifies it. If no usable filesystem exists, prints the manual
# preparation notice and exits 0. No NFS export for the data disk in Phase 1.
# Must run as root on the desktop. Idempotent.
set -euo pipefail

log() { echo "[data-node] $*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root on the data node." >&2
  exit 1
fi

log "installing base packages (nfs server, smart tools, avahi)"
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  nfs-kernel-server smartmontools avahi-daemon openssh-server ufw

systemctl enable --now avahi-daemon
systemctl enable --now smartd 2>/dev/null || log "smartd not available, continuing"

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
