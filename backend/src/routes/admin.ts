import type { FastifyInstance } from "fastify";
import { requirePerm } from "../plugins/session.js";

/**
 * Proves the permission middleware is wired end-to-end.
 * Phase 1 default role is viewer → 403 here. Phase 2+ replaces the stub.
 */
export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/v1/admin/ping",
    { preHandler: requirePerm("system.manage") },
    async (req) => ({ ok: true, role: req.role }),
  );
}
