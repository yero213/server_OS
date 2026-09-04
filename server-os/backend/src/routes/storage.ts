import { cpus, freemem, loadavg, totalmem, uptime } from "node:os";
import type { FastifyInstance } from "fastify";
import { MVP_DISABLED_STORAGE_OPS } from "@serveros/contracts";
import { requirePerm } from "../plugins/authStub.js";
import { getStorageOverview } from "../lib/storage.js";

/** Read-only storage + system routes. All mutations return 501 in Phase 1. */
export async function registerStorageRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/v1/storage/disks",
    { preHandler: requirePerm("storage.read") },
    async () => {
      const overview = await getStorageOverview();
      return {
        supported: overview.supported,
        reason: overview.reason,
        devices: overview.devices,
      };
    },
  );

  app.get(
    "/api/v1/storage/mounts",
    { preHandler: requirePerm("storage.read") },
    async () => {
      const overview = await getStorageOverview();
      return {
        supported: overview.supported,
        reason: overview.reason,
        mounts: overview.mounts,
      };
    },
  );

  app.get(
    "/api/v1/storage/usage",
    { preHandler: requirePerm("storage.read") },
    async () => {
      const overview = await getStorageOverview();
      return {
        supported: overview.supported,
        reason: overview.reason,
        usage: overview.usage,
      };
    },
  );

  app.get(
    "/api/v1/system/info",
    { preHandler: requirePerm("system.read") },
    async () => ({
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      cpuCount: cpus().length,
      cpuModel: cpus()[0]?.model ?? "unknown",
      loadAvg1: loadavg()[0] ?? 0,
      memTotalBytes: totalmem(),
      memFreeBytes: freemem(),
      uptimeSec: Math.floor(uptime()),
    }),
  );

  // ---- MVP-disabled destructive operations: explicit 501, never implemented. ----
  // The operation list lives in @serveros/contracts (MVP_DISABLED_STORAGE_OPS).
  for (const operation of MVP_DISABLED_STORAGE_OPS) {
    app.all(`/api/v1/storage/${operation}`, async (_req, reply) => {
      await reply.status(501).send({
        error: "disabledInMvp",
        message: `Storage operation '${operation}' is disabled in the Phase 1 MVP (read + mount discovery only; no destructive ops).`,
        operation,
      });
    });
  }

  // Catch-all: any other non-GET under /storage/* is a mutation attempt → 501.
  app.route({
    method: ["POST", "PUT", "PATCH", "DELETE"],
    url: "/api/v1/storage/*",
    handler: async (_req, reply) => {
      await reply.status(501).send({
        error: "disabledInMvp",
        message:
          "Storage mutations are disabled in the Phase 1 MVP (read-only discovery only).",
        operation: "unknown",
      });
    },
  });
}
