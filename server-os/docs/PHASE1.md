# Phase 1 — Ubuntu bootstrap: install & verify

## Target

Laptop (control node), minimal Ubuntu Server 24.04 LTS x86_64.

## Install (on the laptop, as a sudo-capable user)

```bash
sudo apt-get update && sudo apt-get install -y git
git clone <repo-url> /opt/server-os
cd /opt/server-os/server-os   # monorepo root inside the clone
sudo bash installer/bootstrap-control.sh
```

Re-run safe: every step checks existing state first
(user, dirs, node>=22, docker, caddy, units); nothing is wiped.

## Definition-of-Done checks

```bash
curl -k https://server.local/api/v1/health
# → {"ok":true,"phase":"phase-1-bootstrap", ... "docker":{"available":true,...}}

systemctl is-enabled serveros-api serveros-helper caddy
systemctl status serveros-api serveros-helper caddy --no-pager

# Storage: read-only discovery
curl -k https://server.local/api/v1/storage/disks | head -c 600

# Destructive ops must answer 501
curl -k -X POST https://server.local/api/v1/storage/format -d '{}'
# → {"error":"disabledInMvp", ...}

# Reboot persistence
sudo reboot
# after reboot: curl health again, all three units active
```

## Frontend

Served by Caddy from `/srv/serveros/frontend` at `https://server.local/`.
Shows API/Docker/compute/storage cards + `Phase 1 / Bootstrap` badge.

## What Phase 1 does NOT do

No App Store, no Immich, no NFS mounts, no data-disk preparation,
no storage mutations of any kind (see `installer/DATA_SAFETY.md`).
