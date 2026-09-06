# Phase 1 — Ubuntu bootstrap: install & verify

## Target (Scenario A, ONLY supported MVP platform)

Laptop (control node), clean minimal Ubuntu Server 26.04 LTS x86_64
(Dell Inspiron 3542). No other OS/version/arch is supported for the MVP.
Umbrel is NOT reinstalled. Clean-install guide: `docs/UBUNTU_INSTALL.md`
(includes the Tailscale remote-admin plane: `docs/TAILSCALE.md`).

`bootstrap-control.sh` refuses to run on anything but Ubuntu 26.04 x86_64.

## Install (on the laptop, as a sudo-capable user, AFTER preflight is clean)

```bash
sudo apt-get update && sudo apt-get install -y git
git clone <repo-url> /opt/server-os
cd /opt/server-os   # monorepo root (contains backend/, installer/, docs/)
bash installer/preflight-control.sh | tee /tmp/preflight.txt
# only with zero FAIL:
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
