# Server OS — Phase 1 / Bootstrap (v0.1.0)

Custom home-server platform on minimal Ubuntu Server.
Single control node (laptop) + headless data node (desktop, NFS later).

**Phase 1 scope:** API foundation, read-only storage discovery, static
dashboard, Caddy reverse proxy, systemd units, idempotent installer.
No Immich, no NFS mounts of `/dev/sdb`, no destructive storage ops.

## Layout

```text
server-os/
├── backend/             # Fastify API (user `serveros`) + root helper (read-only)
├── frontend/            # SvelteKit static dashboard (served by Caddy)
├── packages/contracts/  # Shared Zod schemas, permissions, storage kinds
├── manifests/           # App Store manifests (Phase 1: placeholder only, no Immich)
├── installer/           # Idempotent Ubuntu bootstrap (NOT for blind use, read DATA_SAFETY.md)
├── docs/                # Phase docs, Caddy CA trust, NFS safety pointer
└── README.md
```

## Data safety guarantee

* No MVP component formats, partitions, wipes or modifies `/dev/sdb`.
* `installer/provision-data-node.sh` is **detect-only** for `/dev/sdb`.
* Backend contains **zero** format/partition/wipe code paths; related
  endpoints return `501 DISABLED_IN_MVP` (covered by tests).
* See `installer/DATA_SAFETY.md`.

## Dev quickstart (Windows/Linux dev machine)

```powershell
& "$env:ProgramFiles\nodejs\npm.cmd" install
& "$env:ProgramFiles\nodejs\npm.cmd" test
```

Backend dev:

```powershell
$env:DB_PATH = "$PWD\backend\data\serveros.sqlite"
& "$env:ProgramFiles\nodejs\npm.cmd" --workspace backend run dev
curl http://127.0.0.1:3001/api/v1/health
```

Frontend build (static, `frontend/build/`):

```powershell
& "$env:ProgramFiles\nodejs\npm.cmd" --workspace frontend run build
```

## Production install (Ubuntu Server 24.04 LTS, on the laptop ONLY)

```bash
sudo bash installer/bootstrap-control.sh
curl -k https://server.local/api/v1/health
```

Full details: `docs/PHASE1.md`.
