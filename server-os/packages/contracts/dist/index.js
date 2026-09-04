import { z } from "zod";
/** API envelope version. All routes live under /api/v1. */
export const API_VERSION = "v1";
/** Granular permissions (Phase 1: enforced via stub roles, sessions in Phase 2). */
export const PERMISSIONS = [
    "system.read",
    "system.manage",
    "apps.read",
    "apps.install",
    "apps.update",
    "apps.configure",
    "apps.delete",
    "containers.read",
    "containers.start",
    "containers.stop",
    "containers.restart",
    "containers.delete",
    "containers.logs",
    "storage.read",
    "storage.manage",
    "storage.mount",
    "storage.unmount",
    "servers.read",
    "servers.manage",
    "users.read",
    "users.create",
    "users.update",
    "users.delete",
    "permissions.read",
    "permissions.manage",
];
/** Default roles as permission sets. Custom roles table arrives in Phase 4. */
export const ROLE_PERMISSIONS = {
    admin: ["system.read", "system.manage", "apps.read", "apps.install", "apps.update", "apps.configure", "apps.delete", "containers.read", "containers.start", "containers.stop", "containers.restart", "containers.delete", "containers.logs", "storage.read", "storage.manage", "storage.mount", "storage.unmount", "servers.read", "servers.manage", "users.read", "users.create", "users.update", "users.delete", "permissions.read", "permissions.manage"],
    user: ["system.read", "apps.read", "containers.read", "storage.read", "servers.read"],
    viewer: ["system.read", "apps.read", "containers.read", "storage.read", "servers.read"],
};
/** First-class storage taxonomy (approved arch §8). */
export const STORAGE_KINDS = [
    "local-disk",
    "local-partition",
    "local-filesystem",
    "nfs-remote",
    "docker-volume",
    "local-bind",
    "remote-bind",
];
/** Health response contract for GET /api/v1/health. */
export const HealthResponse = z.object({
    ok: z.boolean(),
    phase: z.literal("phase-1-bootstrap"),
    version: z.string(),
    api: z.object({ status: z.literal("ok"), uptimeSec: z.number() }),
    db: z.object({ ok: z.boolean(), path: z.string() }),
    docker: z.object({
        available: z.boolean(),
        version: z.string().nullable(),
        error: z.string().nullable(),
    }),
    helper: z.object({ available: z.boolean() }),
    storage: z.object({ supported: z.boolean(), reason: z.string().nullable() }),
    dataSafety: z.object({
        sdbUntouched: z.literal(true),
        destructiveOps: z.literal("disabled"),
    }),
});
/** Read-only disk entry (lsblk-derived, never mutated). */
export const DiskEntry = z.object({}).passthrough();
export const StorageDisksResponse = z.object({
    supported: z.boolean(),
    reason: z.string().nullable(),
    devices: z.array(DiskEntry),
});
/** Storage operations explicitly disabled in the Phase 1 MVP. Served as 501. */
export const MVP_DISABLED_STORAGE_OPS = [
    "format",
    "partition",
    "wipe",
    "mkfs",
    "destroy",
    "resize",
    "mount",
    "unmount",
];
/** Standard 501 for MVP-disabled destructive operations. */
export const DisabledInMvp = z.object({
    error: z.literal("disabledInMvp"),
    message: z.string(),
    operation: z.string(),
});
/** Standard API error envelope. */
export const ApiError = z.object({
    error: z.string(),
    message: z.string(),
});
