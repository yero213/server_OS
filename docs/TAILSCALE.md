# Tailscale — remote-admin plane (supported infrastructure, MVP)

Tailscale is a **supported infrastructure component** on both nodes:

* Control/Application Node (laptop, Ubuntu Server 26.04 LTS x86_64)
* Data Node (desktop, headless, Ubuntu Server 26.04 LTS x86_64)

## 1. Purpose / non-purpose

Use Tailscale for:

* remote SSH administration of both nodes;
* secure remote access to Server OS when away from the LAN;
* management connectivity for the headless data node.

Tailscale is explicitly **NOT**:

* a replacement for LAN functionality — everything local keeps working
  exactly as without Tailscale;
* a transport for NFS in the MVP — the laptop↔desktop data plane stays
  on the local LAN (`LAPTOP_IP`-scoped NFS rules, unchanged);
* a Server OS authentication/ACL system in the MVP (no tailnet-aware
  login, no ACL management in Server OS — see §7).

**Offline guarantee:** Server OS works fully when Tailscale is not
installed, is offline, or temporarily fails. LAN SSH, Caddy, the API,
Docker and (LAN) NFS are never gated on Tailscale state.

## 2. Installation (official Ubuntu 26.04 method)

Bootstrap (`bootstrap-control.sh`, `provision-data-node.sh`) uses the
official Tailscale package server, codename-driven (`resolute` on 26.04):

```bash
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/resolute.noarmor.gpg \
  | sudo tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null
curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/resolute.tailscale-keyring.list \
  | sudo tee /etc/apt/sources.list.d/tailscale.list
sudo apt-get update && sudo apt-get install tailscale
sudo systemctl enable --now tailscaled
```

APT (not Snap) is used: full CLI behaviour, no confinement limits
(Snap lacks e.g. `tailscale ssh`). No version pin — stable track follows
regular `apt upgrade`.

## 3. Join policy — NEVER automatic

Bootstrap **installs + enables only**. It never runs the tailnet join,
never asks for an auth key, and stays fully unattended-safe.

Manual join flow (admin, per machine, AFTER Ubuntu install):

1. Install Ubuntu Server 26.04 (see `docs/UBUNTU_INSTALL.md`).
2. Install Tailscale (bootstrap does this, or §2 manually).
3. Run `sudo tailscale up`.
4. Authenticate the machine in the browser / admin console.
5. Verify with `tailscale status` and `tailscale ip -4`.
6. Only then run the Server OS bootstrap / preflight.

Preflight §18 reports Tailscale state read-only (installed / service /
session / tailnet IP) and is WARN-only — a missing or logged-out
Tailscale never blocks Server OS.

## 4. Firewall — UFW + Tailscale

Design rule: **narrow, documented rules only** — no broad
“allow everything from tailscale” rule anywhere.

| Node | Rule | Why |
|---|---|---|
| Control | `allow 41641/udp` | Direct WireGuard peer connections (official Tailscale firewall guidance). Without it Tailscale still works via DERP relay over outbound 443 — slower but functional. |
| Control | *(no `tailscale0` rule)* | Deliberate: tailnet clients reach SSH/web through the existing `22/80/443` rules, exactly like LAN clients. LAN behaviour unchanged. |
| Data | `allow 41641/udp` | Same narrow P2P port as control node. |
| Data | `allow in on tailscale0 to any port 22` | Port-scoped tailnet SSH management for the headless node. NFS (2049) stays `LAPTOP_IP`-only; nothing else is opened to the tailnet. |

Outgoing stays `allow outgoing` on both nodes (DERP/HTTPS/package
downloads need it). Default incoming stays `deny incoming`.

## 5. Security model

```text
LAN:       Server OS + Caddy (https://server.local) + NFS + SSH.
           Primary plane. Always works, with or without Tailscale.

Tailscale: remote administration / remote access only.
           Same services, reached over 100.x.y.z addresses.
           No identity coupling with Server OS accounts in MVP.

Internet:  NOTHING needs direct exposure — no Docker/API/SSH ports
           are forwarded. Remote access goes through the tailnet.

Caddy:     local web interface + local per-app proxy
           (https://<app>.server.local, tls internal). Unchanged by
           Tailscale; no Tailscale-aware exposure in MVP.
```

## 6. Data node

Headless, as before. Tailscale on the data node is for **SSH
management and secure admin connectivity only**. The Immich/NFS
data plane remains LAN-only in the MVP: no tailnet mounts, no
subnet routing, no exit-node configuration.

## 7. Server OS integration (MVP scope)

Informational dashboard fields only (planned, not yet implemented):

* Installed (client present)
* Running (`tailscaled` active)
* Connected (active tailnet session)
* Tailnet IP (`tailscale ip -4`)
* Hostname (tailnet device name)

Explicitly OUT of MVP: Tailscale-based login/SSO, tailnet ACL
management, serve/funnel exposure, exit-node or subnet-router setup.
These need a separate architecture decision later; the read-only
status shape above keeps that door open without committing to it.
