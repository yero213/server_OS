# Ubuntu Server 24.04 clean install — Control Node (Scenario A)

Scenario A decision: the Dell Inspiron 3542 (Control/Application Node) gets
a **clean minimal Ubuntu Server 24.04 LTS, x86_64** install. This is the
**ONLY supported control-node platform for the MVP**. Umbrel is NOT
reinstalled and MUST NOT be present. `bootstrap-control.sh` refuses to run
on anything else (non-24.04 or non-x86_64 → exit 1, no changes made).

## 1. Recommended Ubuntu installation options

* ISO: official **Ubuntu Server 24.04 LTS (noble), amd64** — verify checksum.
* Installer profile: **minimized** server, no extra snaps except OpenSSH
  (see §3). No Docker/Caddy/Node installed manually — bootstrap does that.
* Storage: guided “use entire disk” on the internal HDD (single ~1 TB disk).
  Default ext4 layout is fine. No manual partitioning, no encryption for
  the MVP (keeps recovery simple on this hardware).
* During install: apply updates when offered; reboot when done.

## 2. Required network configuration

* Wired Ethernet preferred (stable pulls of Docker images + Node packages).
* DHCP with a router-side reservation for the laptop, or a static LAN IP —
  either is fine as long as the address is stable.
* Working DNS + outbound TCP 443 to: `registry.npmjs.org`,
  `download.docker.com`, `deb.nodesource.com`, `dl.cloudsmith.io`.
  (Preflight §16 probes exactly these, read-only.)
* No port forwarding from the internet. No public DNS needed (Caddy uses
  `tls internal`, fully offline).

## 3. SSH

* Enable **OpenSSH server** in the installer.
* After first boot, verify LAN login works: `ssh <user>@<laptop-ip>`.
* Key-based auth recommended; keep port **22** on LAN.
  Bootstrap opens 22/tcp in UFW and keeps it.

## 4. Hostname

* Recommended hostname: **`server`** — Caddy serves `https://server.local`
  and `https://*.server.local` out of the box, so `server` + mDNS gives the
  smoothest match. Any other hostname works too, but then reach Caddy via
  the LAN IP or a manual hosts/DNS alias (editing the Caddyfile is out of
  scope for Phase 1).
* `.local` convenience needs Avahi: a §15 WARN (avahi inactive) on a clean
  minimal install is **expected and acceptable** — bootstrap does not
  require it. Optional: `sudo apt-get install -y avahi-daemon`.

## 5. Post-install checks (before touching this repo)

```bash
grep -E '^(ID|VERSION_ID|VERSION_CODENAME|PRETTY_NAME)=' /etc/os-release
# → ID=ubuntu, VERSION_ID="24.04", VERSION_CODENAME=noble
uname -m            # → x86_64
hostnamectl         # → static hostname as chosen above
df -h /             # → ≥ 5 GB free (Docker images + builds need room)
ps -p 1 -o comm=    # → systemd
ss -tln             # → 22 listening; 80/443/3001 must be FREE
lsblk -o NAME,PATH,SIZE,TYPE,FSTYPE,MOUNTPOINT
# → single internal HDD; NO /dev/sdb expected on this machine (§6 PASS/absent)
```

Then fetch the repo (provenance for §17):

```bash
sudo apt-get update && sudo apt-get install -y git
git clone <repo-url> /opt/server-os
cd /opt/server-os   # monorepo root (backend/, installer/, docs/)
git status --porcelain  # → empty (clean)
```

## 6. Exact preflight command

From the repo root, no sudo required (sudo gives deeper blkid/ufw detail):

```bash
bash installer/preflight-control.sh | tee /tmp/preflight.txt
# deeper detail:
sudo bash installer/preflight-control.sh | tee /tmp/preflight.txt
```

Exit `0` = zero FAIL. Exit `1` = at least one FAIL — do NOT bootstrap yet.
Send `/tmp/preflight.txt` back for review before proceeding.

## 7. When bootstrap MAY run safely

ALL of these must hold:

* §1 PASS: Ubuntu 24.04 + x86_64 (anything else FAILs and bootstrap
  will refuse anyway).
* Zero FAIL overall.
* §3: ≥ 5 GB free on `/`.
* §10: PID 1 = systemd.
* §12: 22 listening; 80/443/3001 free (anything occupying 80/443
  conflicts with Caddy).
* §13 PASS: no foreign web server (apache2/nginx/traefik).
* §14 PASS: **no Umbrel remnants** (clean install has none; any WARN
  means the machine is NOT a clean install — resolve first).
* §16: DNS + TCP 443 egress OK (else downloads fail mid-bootstrap).
* §17: repo clean checkout at `/opt/server-os`.
* Expected/acceptable WARNs on a clean box: §7/8/9/11 (Docker, Node 22,
  Caddy, UFW all missing — bootstrap installs them), §15 (avahi, see §4).

Then, and only then:

```bash
sudo bash installer/bootstrap-control.sh
curl -k https://server.local/api/v1/health
```

What bootstrap changes (outside the repo): APT sources for NodeSource,
Docker, Caddy; packages `nodejs`, `docker-ce*`, `caddy`, `ufw`; user
`serveros` (+`docker` group); `/opt/server-os/backend-dist`,
`/var/lib/serveros`, `/srv/serveros/frontend`; units
`serveros-api` + `serveros-helper` (enable --now); `/etc/caddy/Caddyfile`
(overwritten — empty on clean install, otherwise back up); UFW
`allow 22,80,443/tcp`, default-deny incoming. API stays loopback-only
(`127.0.0.1:3001`).

What it NEVER does: touch `/dev/sdb`, format/partition/wipe any disk,
prepare NFS storage, install Immich, or deploy app containers
(machine-enforced by `backend/tests/safety.test.ts`).
