# Ubuntu Server 26.04 clean install — Control Node (Scenario A)

Scenario A decision: the Dell Inspiron 3542 (Control/Application Node) gets
a **clean minimal Ubuntu Server 26.04 LTS (Resolute Raccoon), x86_64**
install. This is the **ONLY supported control-node platform for the MVP**.
Umbrel is NOT reinstalled and MUST NOT be present.
`bootstrap-control.sh` refuses to run on anything else (non-26.04 or
non-x86_64 → exit 1, no changes made).

Tailscale is a supported remote-admin plane (see `docs/TAILSCALE.md`).
Order of operations:

1. Install Ubuntu Server 26.04 (§1–§5).
2. Tailscale is installed + enabled by the Server OS bootstrap (§6),
   or manually beforehand with the same official method.
3. Join the tailnet manually: `sudo tailscale up`.
4. Authenticate the machine (browser / admin console).
5. Verify with `tailscale status` and `tailscale ip -4`.
6. Only then run preflight (§7) and the Server OS bootstrap (§8).

Server OS works fully WITHOUT Tailscale too — LAN functionality never
depends on it. Joining is required only for off-LAN administration.

## 1. Recommended Ubuntu installation options

* ISO: official **Ubuntu Server 26.04 LTS (resolute), amd64** — verify checksum.
* Installer profile: **minimized** server, no extra snaps except OpenSSH
  (see §3). No Docker/Caddy/Node/Tailscale installed manually — bootstrap
  does that (Tailscale join itself stays manual, see §6).
* Storage: guided “use entire disk” on the internal HDD (single ~1 TB disk).
  Default ext4 layout is fine. No manual partitioning, no encryption for
  the MVP (keeps recovery simple on this hardware).
* During install: apply updates when offered; reboot when done.

## 2. Required network configuration

* Wired Ethernet preferred (stable pulls of Docker images + Node packages).
* DHCP with a router-side reservation for the laptop, or a static LAN IP —
  either is fine as long as the address is stable.
* Working DNS + outbound TCP 443 to: `registry.npmjs.org`,
  `download.docker.com`, `deb.nodesource.com`, `dl.cloudsmith.io`,
  `pkgs.tailscale.com`.
  (Preflight §16 probes exactly these, read-only.)
* No port forwarding from the internet. No public DNS needed (Caddy uses
  `tls internal`, fully offline; remote access goes over Tailscale).

## 3. SSH

* Enable **OpenSSH server** in the installer.
* After first boot, verify LAN login works: `ssh <user>@<laptop-ip>`.
* Key-based auth recommended; keep port **22** on LAN.
  Bootstrap opens 22/tcp in UFW and keeps it. Tailnet SSH uses the same
  port 22 rule — no extra firewall work needed on the control node.

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
# → ID=ubuntu, VERSION_ID="26.04", VERSION_CODENAME=resolute
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

## 6. Tailscale (remote-admin plane, manual join)

Bootstrap installs Tailscale from the official package server
(`resolute` track) and enables `tailscaled` — it NEVER joins the
tailnet and NEVER asks for an auth key. Join manually when YOU want
off-LAN access (skip this section if LAN-only is fine for now):

```bash
sudo tailscale up
# → open the printed URL, authenticate the machine
tailscale status    # → this machine Listed, peers visible
tailscale ip -4     # → 100.x.y.z tailnet address
```

Notes:

* Preflight §18 reports Tailscale state read-only and is WARN-only:
  not-installed / logged-out never blocks Server OS.
* If Tailscale was installed manually BEFORE bootstrap with the §2
  commands from `docs/TAILSCALE.md`, bootstrap detects it and skips
  the repo setup (idempotent).
* Data node: same join flow on the desktop gives headless SSH
  management; NFS between the nodes stays LAN-only regardless.

## 7. Exact preflight command

From the repo root, no sudo required (sudo gives deeper blkid/ufw detail):

```bash
bash installer/preflight-control.sh | tee /tmp/preflight.txt
# deeper detail:
sudo bash installer/preflight-control.sh | tee /tmp/preflight.txt
```

Exit `0` = zero FAIL. Exit `1` = at least one FAIL — do NOT bootstrap yet.
Send `/tmp/preflight.txt` back for review before proceeding.

## 8. When bootstrap MAY run safely

ALL of these must hold:

* §1 PASS: Ubuntu 26.04 + x86_64 (anything else FAILs and bootstrap
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
* §18: informational ONLY — any state (absent/logged-out/connected)
  is acceptable for bootstrap.
* Expected/acceptable WARNs on a clean box: §7/8/9/11 (Docker, Node 22,
  Caddy, UFW all missing — bootstrap installs them), §15 (avahi, see §4),
  §18 (Tailscale, see §6).

Then, and only then:

```bash
sudo bash installer/bootstrap-control.sh
curl -k https://server.local/api/v1/health
```

What bootstrap changes (outside the repo): APT sources for NodeSource,
Docker, Caddy, Tailscale; packages `nodejs`, `docker-ce*`, `caddy`,
`tailscale`, `ufw`; user `serveros` (+`docker` group);
`/opt/server-os/backend-dist`, `/var/lib/serveros`,
`/srv/serveros/frontend`; units `serveros-api` + `serveros-helper` and
`tailscaled` (enable --now); `/etc/caddy/Caddyfile` (overwritten — empty
on clean install, otherwise back up); UFW `allow 22,80,443/tcp` +
`allow 41641/udp` (Tailscale direct connections, documented in
`docs/TAILSCALE.md`), default-deny incoming. API stays loopback-only
(`127.0.0.1:3001`).

What it NEVER does: touch `/dev/sdb`, format/partition/wipe any disk,
prepare NFS storage, install Immich, deploy app containers, join the
tailnet, or ask for a Tailscale auth key
(machine-enforced by `backend/tests/safety.test.ts` and
`backend/tests/bootstrap.test.ts`).
