# NFS safety model — implementation pointer (approved arch §6)

Binding rule: Immich media must NEVER silently fall back to laptop-local
storage when the NFS mount disappears.

## Four layers (to be implemented in Phase 9, tested before Immich ships)

1. **Mountpoint hygiene:** unmounted `/mnt/immich-media` stays
   `root:root 0555` and empty — casual writes fail instead of hiding.
2. **Pre-start gate** in `AppService` before every start/install/restart
   that needs remote storage: `mountpoint -q` + `/proc/mounts` fstype +
   3s-timeout `statvfs` + sentinel `.serveros-guard` match + free-space
   check. ANY failure → `409 STORAGE_UNAVAILABLE`, no compose call.
3. **Compose `bind.create_host_path: false`** on every remote bind so
   Docker refuses to start (loud) instead of creating a local shadow dir.
4. **systemd automount** (`hard,nofail,x-systemd.automount`): stuck I/O
   waits instead of seeing an empty dir; boot never hangs on a dead peer.

## Failure policy (approved correction §4)

No automatic stop/pause of running containers on NFS failure (stop hangs
in D-state, kills mid-upload). Instead: mark affected apps `degraded`,
block new starts, surface a banner, offer manual Stop + Retry-mount.
Running writers get loud `EIO` in logs — visible, never silent.

## Transport scope (MVP)

NFS is the LAN-only data plane between control node and data node.
Tailscale is the remote-admin/management plane and is NEVER a transport
for NFS mounts in the MVP (see `docs/TAILSCALE.md` §6).

## Proof gate

`tests/chaos/nfs-fail.sh` (VM-only, Phase 9): kill NFS → assert gate
refuses start → assert zero new local files → restore → sentinel match →
start allowed. Immich does not ship until this test passes.
