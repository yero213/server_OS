import { z } from "zod";
/** API envelope version. All routes live under /api/v1. */
export declare const API_VERSION: "v1";
/** Granular permissions (Phase 1: enforced via stub roles, sessions in Phase 2). */
export declare const PERMISSIONS: readonly ["system.read", "system.manage", "apps.read", "apps.install", "apps.update", "apps.configure", "apps.delete", "containers.read", "containers.start", "containers.stop", "containers.restart", "containers.delete", "containers.logs", "storage.read", "storage.manage", "storage.mount", "storage.unmount", "servers.read", "servers.manage", "users.read", "users.create", "users.update", "users.delete", "permissions.read", "permissions.manage"];
export type Permission = (typeof PERMISSIONS)[number];
/** Default roles as permission sets. Custom roles table arrives in Phase 4. */
export declare const ROLE_PERMISSIONS: Record<"admin" | "user" | "viewer", Permission[]>;
export type Role = keyof typeof ROLE_PERMISSIONS;
/** First-class storage taxonomy (approved arch §8). */
export declare const STORAGE_KINDS: readonly ["local-disk", "local-partition", "local-filesystem", "nfs-remote", "docker-volume", "local-bind", "remote-bind"];
export type StorageKind = (typeof STORAGE_KINDS)[number];
/** Health response contract for GET /api/v1/health. */
export declare const HealthResponse: z.ZodObject<{
    ok: z.ZodBoolean;
    phase: z.ZodLiteral<"phase-1-bootstrap">;
    version: z.ZodString;
    api: z.ZodObject<{
        status: z.ZodLiteral<"ok">;
        uptimeSec: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        status: "ok";
        uptimeSec: number;
    }, {
        status: "ok";
        uptimeSec: number;
    }>;
    db: z.ZodObject<{
        ok: z.ZodBoolean;
        path: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        ok: boolean;
        path: string;
    }, {
        ok: boolean;
        path: string;
    }>;
    docker: z.ZodObject<{
        available: z.ZodBoolean;
        version: z.ZodNullable<z.ZodString>;
        error: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        version: string | null;
        available: boolean;
        error: string | null;
    }, {
        version: string | null;
        available: boolean;
        error: string | null;
    }>;
    helper: z.ZodObject<{
        available: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        available: boolean;
    }, {
        available: boolean;
    }>;
    storage: z.ZodObject<{
        supported: z.ZodBoolean;
        reason: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        supported: boolean;
        reason: string | null;
    }, {
        supported: boolean;
        reason: string | null;
    }>;
    dataSafety: z.ZodObject<{
        sdbUntouched: z.ZodLiteral<true>;
        destructiveOps: z.ZodLiteral<"disabled">;
    }, "strip", z.ZodTypeAny, {
        sdbUntouched: true;
        destructiveOps: "disabled";
    }, {
        sdbUntouched: true;
        destructiveOps: "disabled";
    }>;
}, "strip", z.ZodTypeAny, {
    ok: boolean;
    phase: "phase-1-bootstrap";
    version: string;
    api: {
        status: "ok";
        uptimeSec: number;
    };
    db: {
        ok: boolean;
        path: string;
    };
    docker: {
        version: string | null;
        available: boolean;
        error: string | null;
    };
    helper: {
        available: boolean;
    };
    storage: {
        supported: boolean;
        reason: string | null;
    };
    dataSafety: {
        sdbUntouched: true;
        destructiveOps: "disabled";
    };
}, {
    ok: boolean;
    phase: "phase-1-bootstrap";
    version: string;
    api: {
        status: "ok";
        uptimeSec: number;
    };
    db: {
        ok: boolean;
        path: string;
    };
    docker: {
        version: string | null;
        available: boolean;
        error: string | null;
    };
    helper: {
        available: boolean;
    };
    storage: {
        supported: boolean;
        reason: string | null;
    };
    dataSafety: {
        sdbUntouched: true;
        destructiveOps: "disabled";
    };
}>;
export type HealthResponse = z.infer<typeof HealthResponse>;
/** Read-only disk entry (lsblk-derived, never mutated). */
export declare const DiskEntry: z.ZodObject<{}, "passthrough", z.ZodTypeAny, z.objectOutputType<{}, z.ZodTypeAny, "passthrough">, z.objectInputType<{}, z.ZodTypeAny, "passthrough">>;
export declare const StorageDisksResponse: z.ZodObject<{
    supported: z.ZodBoolean;
    reason: z.ZodNullable<z.ZodString>;
    devices: z.ZodArray<z.ZodObject<{}, "passthrough", z.ZodTypeAny, z.objectOutputType<{}, z.ZodTypeAny, "passthrough">, z.objectInputType<{}, z.ZodTypeAny, "passthrough">>, "many">;
}, "strip", z.ZodTypeAny, {
    supported: boolean;
    reason: string | null;
    devices: z.objectOutputType<{}, z.ZodTypeAny, "passthrough">[];
}, {
    supported: boolean;
    reason: string | null;
    devices: z.objectInputType<{}, z.ZodTypeAny, "passthrough">[];
}>;
export type StorageDisksResponse = z.infer<typeof StorageDisksResponse>;
/** Storage operations explicitly disabled in the Phase 1 MVP. Served as 501. */
export declare const MVP_DISABLED_STORAGE_OPS: readonly ["format", "partition", "wipe", "mkfs", "destroy", "resize", "mount", "unmount"];
export type MvpDisabledStorageOp = (typeof MVP_DISABLED_STORAGE_OPS)[number];
/** Standard 501 for MVP-disabled destructive operations. */
export declare const DisabledInMvp: z.ZodObject<{
    error: z.ZodLiteral<"disabledInMvp">;
    message: z.ZodString;
    operation: z.ZodString;
}, "strip", z.ZodTypeAny, {
    message: string;
    error: "disabledInMvp";
    operation: string;
}, {
    message: string;
    error: "disabledInMvp";
    operation: string;
}>;
export type DisabledInMvp = z.infer<typeof DisabledInMvp>;
/** Standard API error envelope. */
export declare const ApiError: z.ZodObject<{
    error: z.ZodString;
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    message: string;
    error: string;
}, {
    message: string;
    error: string;
}>;
export type ApiError = z.infer<typeof ApiError>;
