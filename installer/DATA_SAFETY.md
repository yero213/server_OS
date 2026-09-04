# Data safety rules (binding for every phase of this project)

1. No MVP component formats, repartitions, wipes, erases or otherwise
   modifies the data disk on the data node (see approved arch §1).
   Forbidden tooling includes: mkfs.*, wipefs, parted, sgdisk/sfdisk/fdisk,
   mkswap, cryptsetup destructive subcommands, shred, dd with a raw-disk
   target, and any equivalent.
2. `installer/provision-data-node.sh` is DETECT-ONLY for the data disk:
   it reports identity/size/filesystem via lsblk+blkid and exits with a
   manual-preparation notice when no usable filesystem exists.
3. The backend has no code path that can write to a raw disk. Destructive
   storage endpoints answer `501 disabledInMvp`. This is enforced by
   `backend/tests/safety.test.ts`, which fails the build if forbidden
   tooling names appear in `backend/src` or `installer/*.sh`.
4. Mounting the data disk is NOT part of Phase 1. No automount unit, no
   fstab entry and no NFS export for it is created by any Phase 1 script.
5. Any future phase that needs destructive operations must: (a) update the
   safety test deliberately, (b) require explicit serial-number confirmation,
   (c) keep the operation behind a manual admin action — never automatic.
