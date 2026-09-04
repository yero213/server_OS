import { z } from "zod";

/** API envelope version. All routes live under /api/v1. */
export const API_VERSION = "v1" as const;

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
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Default roles as permission sets. Custom roles table arrives in Phase 4. */
export const ROLE_PERMISSIONS: Record<"admin" | "user" | "viewer", Permission[]> = {
  admin: ["system.read", "system.manage", "apps.read", "apps.install", "apps.update", "apps.configure", "apps.delete", "containers.read", "containers.start", "containers.stop", "containers.restart", "containers.delete", "containers.logs", "storage.read", "storage.manage", "storage.mount", "storage.unmount", "servers.read", "servers.manage", "users.read", "users.create", "users.update", "users.delete", "permissions.read", "permissions.manage"],
  user: ["system.read", "apps.read", "containers.read", "storage.read", "servers.read"],
  viewer: ["system.read", "apps.read", "containers.read", "storage.read", "servers.read"],
};
export type Role = keyof typeof ROLE_PERMISSIONS;

/** First-class storage taxonomy (approved arch §8). */
export const STORAGE_KINDS = [
  "local-disk",
  "local-partition",
  "local-filesystem",
  "nfs-remote",
  "docker-volume",
  "local-bind",
  "remote-bind",
] as const;
export type StorageKind = (typeof STORAGE_KINDS)[number];

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
export type HealthResponse = z.infer<typeof HealthResponse>;

/** Read-only disk entry (lsblk-derived, never mutated). */
export const DiskEntry = z.object({}).passthrough();
export const StorageDisksResponse = z.object({
  supported: z.boolean(),
  reason: z.string().nullable(),
  devices: z.array(DiskEntry),
});
export type StorageDisksResponse = z.infer<typeof StorageDisksResponse>;

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
] as const;
export type MvpDisabledStorageOp = (typeof MVP_DISABLED_STORAGE_OPS)[number];

/** Standard 501 for MVP-disabled destructive operations. */
export const DisabledInMvp = z.object({
  error: z.literal("disabledInMvp"),
  message: z.string(),
  operation: z.string(),
});
export type DisabledInMvp = z.infer<typeof DisabledInMvp>;

/** Standard API error envelope. */
export const ApiError = z.object({
  error: z.string(),
  message: z.string(),
});
export type ApiError = z.infer<typeof ApiError>;
