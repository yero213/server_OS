# Control-node preflight audit

Read-only validation of the Dell Inspiron 3542 (control/application node)
**before** `bootstrap-control.sh` is ever executed.

Scenario A: the control node is a **clean minimal Ubuntu Server 24.04 LTS
(x86_64)** install. That is the ONLY supported MVP platform. Umbrel is NOT
reinstalled and must NOT be present — on a clean install §14 reports
“no umbrel remnants detected” (PASS). Any §14 WARN means the machine is
not a clean install; resolve it before bootstrap. Full clean-install
guide: `docs/UBUNTU_INSTALL.md`.

## Run (on the laptop, from the repo root, no sudo required)

```bash
bash installer/preflight-control.sh
# deeper blkid/ufw detail:
sudo bash installer/preflight-control.sh
# non-default checkout location:
REPO_DIR=/path/to/server-os bash installer/preflight-control.sh
```

Exit code `0` = no FAIL. Exit code `1` = at least one FAIL, fix before bootstrap.
Output is stdout only; redirect to a file yourself if you want to keep it:

```bash
bash installer/preflight-control.sh | tee /tmp/preflight.txt
```

## What each check means

| § | Check (tools used) | PASS | WARN | FAIL |
|---|---|---|---|---|
| 0 | Audit mode (`id`) | — (info) | not root: reduced depth for blkid/ufw/socket owners | — |
| 1 | OS Scenario A (`/etc/os-release`, `uname`, `hostname`) | Ubuntu Server **24.04** + `x86_64` | — | no os-release, non-Ubuntu ID, Ubuntu ≠ 24.04, or arch ≠ x86_64 (bootstrap refuses) |
| 2 | CPU/RAM (`nproc`, `/proc/cpuinfo`, `/proc/meminfo`) | RAM ≥ ~7 GB | below 7 GB (8 GB expected) | — |
| 3 | Free space (`df -B1 /`) | ≥ 5 GB free | 2–5 GB (tight for images) | < 2 GB, do not bootstrap |
| 4 | Attachments (`findmnt`, fallback `/proc/mounts`) | table readable | findmnt missing, fallback used | — |
| 5 | Block devices (`lsblk`, `blkid`) | inventory shown | blkid incomplete without root / tool missing | `lsblk` missing |
| 6 | Data-disk presence (`[ -b /dev/sdb ]`, `lsblk`) | present-but-untouched, or correctly absent | — | — (never fails; observation only) |
| 7 | Docker (`docker --version/info/ps`, `docker compose version`) | daemon reachable | missing / daemon down / no compose plugin | — |
| 8 | Node (`node --version`, `npm --version`) | node ≥ 22 | older/missing (bootstrap installs 22 LTS) | — |
| 9 | Caddy (`caddy version`, `[ -f /etc/caddy/Caddyfile ]`) | binary present | missing, or existing Caddyfile (bootstrap **overwrites** it — back up first) | — |
| 10 | systemd (`ps -p 1`, `systemctl is-enabled/is-active`, `list-units 'serveros*'`) | PID 1 = systemd | pre-existing `serveros*` units (review before reuse) | PID 1 ≠ systemd |
| 11 | UFW (`ufw status`) | status readable | missing, or needs root for detail | — |
| 12 | Ports (`ss -tln`, fallback `netstat`) | 22 listening; 80/443/3001 free | 22 down, or 80/443/3001 occupied (holder printed) | — |
| 13 | Conflicting processes (`pgrep -a -f 'apache2\|nginx\|traefik\|lighttpd'`) | none found | foreign web server printed (owns 80/443?) | — |
| 14 | Umbrel remnants (paths `/opt/umbrel`, `~/umbrel`, `/srv/umbrel`, `/home/*/umbrel`; `docker ps -a` name/image match; `list-units 'umbrel*'`) | none detected | any path/container/unit printed — resolve before bootstrap | — |
| 15 | Hostname/mDNS (`hostname`, `hostnamectl`, `systemctl is-active avahi-daemon`, `getent hosts <hn>.local`) | avahi active + `<hn>.local` resolves | avahi down or `.local` unresolvable | — |
| 16 | Internet/DNS read-only (`getent hosts` on the 4 bootstrap registries; TCP 443 connect to 1.1.0.1 with 5 s timeout, no payload) | egress ok | DNS/TCP failure (downloads would fail) | — |
| 17 | Repo state (`git rev-parse`, `git status --porcelain` in `$REPO_DIR`, default `/opt/server-os`) | clean checkout | dirty / not a checkout (provenance unverifiable) | — |

## Guarantees

* The script performs **zero writes**: no installs, no service control, no disk
  writes, no network reconfiguration, no stdout file creation.
* This is machine-enforced by `backend/tests/preflight.test.ts`, which scans
  the script for mutating commands (package installs, service control, disk
  tooling, `mount`, redirections outside `/dev/null`, `sudo`, `ufw` changes,
  `caddy` control commands, mutating `git`/`docker` verbs) and for the
  presence of the required read-only probes.
* `safety.test.ts` additionally covers the script for destructive storage
  binary names.

## Relation to bootstrap

Preflight changes nothing and installs nothing. Only when every FAIL is
resolved should `sudo bash installer/bootstrap-control.sh` be considered —
and that step is **explicitly out of scope** until the preflight report has
been reviewed. See `docs/PHASE1.md` for what bootstrap will change.
