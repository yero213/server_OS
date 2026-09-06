#!/usr/bin/env bash
# Server OS — control-node preflight audit (Phase 1 validation).
#
# Strictly READ-ONLY: probes OS, hardware, Docker, network and repo state,
# then prints a PASS/WARN/FAIL report to stdout. Nothing is installed,
# started, stopped, written or reconfigured. Report-only by design;
# destructive storage tooling is out of scope (see DATA_SAFETY.md).
#
# Usage (on the control node, from the repo root):
#   bash installer/preflight-control.sh
# Root is NOT required; with sudo some probes gain depth (blkid, ufw).
set -uo pipefail

PASS=0
WARN=0
FAIL=0

section() { echo; echo "== $1 =="; }
pass() { PASS=$((PASS + 1)); echo "[PASS] $1"; }
warn() { WARN=$((WARN + 1)); echo "[WARN] $1"; }
fail() { FAIL=$((FAIL + 1)); echo "[FAIL] $1"; }
info() { echo "[INFO] $1"; }
have() { command -v "$1" >/dev/null 2>&1; }

ROOT=0
if [ "$(id -u)" -eq 0 ]; then ROOT=1; fi

section "0. Audit mode"
info "read-only preflight; this script changes nothing"
if [ "$ROOT" -eq 1 ]; then
  info "running as root: full probe depth"
else
  warn "not root: blkid/ufw/socket-owner depth reduced (re-run with sudo for full depth)"
fi

section "1. Operating system (Scenario A: Ubuntu Server 26.04 only)"
if [ -f /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  info "os: ${NAME:-unknown} ${VERSION_ID:-?} (id=${ID:-?})"
  if [ "${ID:-}" = "ubuntu" ] && [ "${VERSION_ID:-}" = "26.04" ]; then
    pass "Ubuntu Server 26.04 detected"
  elif [ "${ID:-}" = "ubuntu" ]; then
    fail "Ubuntu ${VERSION_ID:-?} detected; ONLY clean 26.04 LTS is supported (see docs/UBUNTU_INSTALL.md)"
  else
    fail "not Ubuntu (id=${ID:-?}); ONLY Ubuntu Server 26.04 is supported"
  fi
else
  fail "/etc/os-release missing; cannot verify Ubuntu 26.04"
fi
info "kernel: $(uname -r)"
ARCH="$(uname -m)"
info "arch: $ARCH"
if [ "$ARCH" = "x86_64" ]; then
  pass "architecture is x86_64"
else
  fail "architecture $ARCH is not x86_64 (MVP is x86_64-only)"
fi
info "hostname: $(hostname)"

section "2. CPU and memory"
info "cpu count: $(nproc)"
MODEL="$(grep -m1 'model name' /proc/cpuinfo 2>/dev/null | cut -d: -f2- | xargs || true)"
info "cpu model:${MODEL:- unknown}"
MEM_KB="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo 2>/dev/null || true)"
info "mem total kB: ${MEM_KB:-?}"
if [ "${MEM_KB:-0}" -ge 7000000 ]; then
  pass "memory >= ~7 GB"
else
  warn "memory below 7 GB (${MEM_KB:-?} kB); 8 GB expected on control node"
fi

section "3. Free disk space"
ROOT_AVAIL="$(df -B1 --output=avail / 2>/dev/null | tail -n 1 | tr -dc '0-9' || true)"
info "avail bytes on /: ${ROOT_AVAIL:-?}"
if [ "${ROOT_AVAIL:-0}" -ge 5000000000 ]; then
  pass ">= 5 GB free on / (docker images + builds fit)"
elif [ "${ROOT_AVAIL:-0}" -ge 2000000000 ]; then
  warn "2-5 GB free on /; tight for Docker images, free space before bootstrap"
else
  fail "< 2 GB free on /; bootstrap must not run yet"
fi
ROTA="$(lsblk -d -n -o ROTA 2>/dev/null | tr -d ' ' | sort -u | tr '\n' ',' || true)"
info "rotational flags (1=HDD,0=SSD): ${ROTA:-?}"
case "$ROTA" in
  *1*) info "rotating disk present; image pulls and builds will be slower" ;;
esac

section "4. Current attachments"
if findmnt -R -o TARGET,SOURCE,FSTYPE,OPTIONS >/dev/null 2>&1; then
  findmnt -R -o TARGET,SOURCE,FSTYPE,OPTIONS 2>/dev/null | head -n 40 || true
  pass "attachment table readable via findmnt"
else
  warn "findmnt unavailable; falling back to /proc/mounts"
  head -n 40 /proc/mounts || true
fi

section "5. Block devices"
if have lsblk; then
  lsblk -o NAME,PATH,SIZE,MODEL,SERIAL,TRAN,TYPE,FSTYPE,MOUNTPOINT,UUID || true
  pass "lsblk inventory shown"
else
  fail "lsblk tool missing"
fi
if have blkid; then
  BLK="$(blkid 2>&1 || true)"
  echo "$BLK" | head -n 20
  if [ "$ROOT" -eq 1 ]; then
    pass "blkid signatures shown"
  else
    warn "blkid run without root; signatures may be incomplete"
  fi
else
  warn "blkid tool missing"
fi

section "6. Data-disk presence"
SDB_DEV="/dev/sdb"
if [ -b "$SDB_DEV" ]; then
  SDB_SIZE="$(lsblk -b -d -n -o SIZE "$SDB_DEV" 2>/dev/null || true)"
  SDB_MODEL="$(lsblk -d -n -o MODEL "$SDB_DEV" 2>/dev/null | xargs || true)"
  info "present: $SDB_DEV size_bytes=${SDB_SIZE:-?} model=${SDB_MODEL:-?}"
  info "left untouched: audit performs zero writes"
  pass "candidate data disk detected and untouched"
else
  info "absent: no extra data disk on this machine (expected on control node)"
  pass "no unexpected data disk"
fi

section "7. Docker"
if have docker; then
  info "client: $(docker --version 2>/dev/null || true)"
  if docker info >/dev/null 2>&1; then
    info "server version: $(docker info --format '{{.ServerVersion}}' 2>/dev/null || true)"
    pass "docker daemon reachable"
    if docker compose version >/dev/null 2>&1; then
      info "compose: $(docker compose version 2>/dev/null || true)"
      pass "compose plugin present"
    else
      warn "compose plugin missing (bootstrap installs it)"
    fi
    info "containers (read-only list):"
    docker ps --format '{{.Names}} {{.Image}} {{.Status}}' 2>/dev/null | head -n 20 || true
  else
    warn "docker client present but daemon unreachable"
  fi
else
  warn "docker not installed (bootstrap will install it)"
fi

section "8. Node.js and npm"
if have node; then
  info "node: $(node --version 2>/dev/null || true)"
  MAJ="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [ "$MAJ" -ge 22 ] 2>/dev/null; then
    pass "node >= 22 present"
  else
    warn "node < 22 present (bootstrap installs Node 22 LTS)"
  fi
else
  warn "node not installed (bootstrap installs Node 22 LTS)"
fi
if have npm; then
  info "npm: $(npm --version 2>/dev/null || true)"
else
  info "npm not present (ships with the Node install)"
fi

section "9. Caddy"
if have caddy; then
  info "$(caddy version 2>/dev/null || true)"
  if [ -f /etc/caddy/Caddyfile ]; then
    warn "/etc/caddy/Caddyfile already exists; bootstrap overwrites it (back it up first)"
  else
    info "no existing Caddyfile; bootstrap installs a fresh one"
  fi
  pass "caddy binary present"
else
  warn "caddy not installed (bootstrap installs it)"
fi

section "10. systemd"
INIT="$(ps -p 1 -o comm= 2>/dev/null | tail -n 1 | xargs || true)"
if [ "$INIT" = "systemd" ]; then
  pass "PID 1 is systemd"
else
  fail "PID 1 is '${INIT:-?}', expected systemd"
fi
info "$(systemctl --version 2>/dev/null | head -n 1 || true)"
for u in docker caddy serveros-api serveros-helper; do
  EN="$(systemctl is-enabled "$u" 2>&1 || true)"
  AC="$(systemctl is-active "$u" 2>&1 || true)"
  info "unit $u: enabled=${EN} active=${AC}"
done
OURS="$(systemctl list-units --all 'serveros*' --no-legend 2>/dev/null || true)"
if [ -z "$OURS" ]; then
  info "no serveros units installed yet (expected before bootstrap)"
else
  warn "existing serveros units found; bootstrap reuses them, review first"
  echo "$OURS"
fi

section "11. UFW firewall"
if have ufw; then
  UFW="$(ufw status 2>&1 || true)"
  echo "$UFW" | head -n 20
  if echo "$UFW" | grep -qi "need to be root"; then
    warn "ufw status needs root (re-run with sudo for rule detail)"
  else
    pass "ufw status readable"
  fi
else
  warn "ufw not installed (bootstrap installs it)"
fi

section "12. Ports 22/80/443/3001"
SS="$(ss -tln 2>/dev/null || netstat -tln 2>/dev/null || true)"
if [ -z "$SS" ]; then
  warn "neither ss nor netstat available; ports unchecked"
else
  if echo "$SS" | grep -q ":22[[:space:]]"; then
    pass "port 22 listening (ssh)"
  else
    warn "port 22 not listening; remote access may be down"
  fi
  for p in 80 443 3001; do
    if echo "$SS" | grep -q ":$p[[:space:]]"; then
      warn "port $p already listening; holder detail below (conflicts with Caddy/API)"
      echo "$SS" | grep ":$p[[:space:]]" | head -n 5 || true
    else
      pass "port $p free"
    fi
  done
fi

section "13. Possibly conflicting processes"
CONFL="$(pgrep -a -f 'apache2|nginx|traefik|lighttpd' 2>/dev/null || true)"
if [ -z "$CONFL" ]; then
  pass "no foreign web-server processes found"
else
  warn "foreign web-server processes (take port 80/443?):"
  echo "$CONFL"
fi

section "14. Previous home-server components"
UMBREL_HIT=0
for d in "$HOME/umbrel" "$HOME/.umbrel" /opt/umbrel /srv/umbrel /home/umbrel; do
  if [ -e "$d" ]; then
    warn "umbrel path present: $d"
    UMBREL_HIT=1
  fi
done
for d in /home/*/umbrel; do
  if [ -e "$d" ]; then
    warn "umbrel path present: $d"
    UMBREL_HIT=1
  fi
done
if docker info >/dev/null 2>&1; then
  UNAMES="$(docker ps -a --format '{{.Names}} {{.Image}}' 2>/dev/null | grep -i umbrel || true)"
  if [ -n "$UNAMES" ]; then
    warn "umbrel containers present (read-only list):"
    echo "$UNAMES"
    UMBREL_HIT=1
  else
    info "no umbrel containers"
  fi
else
  info "docker down; container check skipped"
fi
UUNITS="$(systemctl list-units --all 'umbrel*' --no-legend 2>/dev/null || true)"
if [ -n "$UUNITS" ]; then
  warn "umbrel systemd units present:"
  echo "$UUNITS"
  UMBREL_HIT=1
else
  info "no umbrel systemd units"
fi
if [ "$UMBREL_HIT" -eq 0 ]; then
  pass "no umbrel remnants detected"
fi

section "15. Hostname and mDNS"
HN="$(hostname)"
info "hostname: $HN"
if have hostnamectl; then
  info "static hostname: $(hostnamectl --static 2>/dev/null || true)"
fi
if systemctl is-active --quiet avahi-daemon 2>/dev/null; then
  pass "avahi-daemon active"
else
  warn "avahi-daemon not active; .local names may not resolve"
fi
if getent hosts "$HN.local" >/dev/null 2>&1; then
  pass "$HN.local resolves"
else
  warn "$HN.local does not resolve yet"
fi

section "16. Internet and DNS (read-only probes)"
DNS_OK=0
for h in registry.npmjs.org download.docker.com deb.nodesource.com dl.cloudsmith.io pkgs.tailscale.com; do
  if getent hosts "$h" >/dev/null 2>&1; then
    info "DNS ok: $h"
    DNS_OK=1
  else
    warn "DNS fail: $h"
  fi
done
if timeout 5 bash -c '</dev/tcp/1.1.0.1/443' >/dev/null 2>&1; then
  pass "TCP 443 reachable (egress ok for package downloads)"
else
  warn "TCP 443 unreachable; bootstrap downloads would fail"
fi
if [ "$DNS_OK" -eq 0 ]; then
  warn "no registry host resolved; check DNS before bootstrap"
fi

section "17. Server OS repository state"
REPO_DIR="${REPO_DIR:-/opt/server-os}"
if [ -d "$REPO_DIR/.git" ]; then
  info "HEAD: $(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || true)"
  ST="$(git -C "$REPO_DIR" status --porcelain 2>&1 || true)"
  if [ -z "$ST" ]; then
    pass "repo clean: $REPO_DIR"
  else
    warn "repo has local changes:"
    echo "$ST" | head -n 20
  fi
else
  warn "not a git checkout at $REPO_DIR (provenance unverifiable; set REPO_DIR= to override)"
fi

section "18. Tailscale (remote-admin plane, optional)"
if have tailscale; then
  info "client: $(tailscale version 2>/dev/null | head -n 1 || true)"
  pass "tailscale client installed"
  if systemctl is-active --quiet tailscaled 2>/dev/null; then
    info "tailscaled service active"
  else
    warn "tailscaled service not active (join impossible until it runs)"
  fi
  if tailscale status >/dev/null 2>&1; then
    pass "tailnet session active"
    info "tailnet ip: $(tailscale ip -4 2>/dev/null | head -n 1 || true)"
  else
    warn "no active tailnet session (join manually when needed; see docs/TAILSCALE.md)"
  fi
else
  warn "tailscale not installed (optional in MVP; Server OS works without it)"
fi

section "Summary"
echo "PASS=$PASS WARN=$WARN FAIL=$FAIL"
echo "read-only audit complete: no changes were made to this machine"
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
