import type { FastifyInstance } from "fastify";
import { VERSION, PHASE } from "../config.js";
import type { DbHandle } from "../db.js";
import { isDbHealthy } from "../db.js";
import { getDockerStatus } from "../lib/docker.js";
import { isHelperAvailable } from "../lib/helperClient.js";
import { getStorageOverview } from "../lib/storage.js";

export interface HealthDeps {
  db: DbHandle;
}

export async function registerHealthRoutes(
  app: FastifyInstance,
  deps: HealthDeps,
): Promise<void> {
  app.get("/api/v1/health", async () => {
    const [docker, helper, storage] = await Promise.all([
      getDockerStatus(),
      isHelperAvailable(),
      getStorageOverview(),
    ]);
    return {
      ok: true,
      phase: PHASE,
      version: VERSION,
      api: { status: "ok", uptimeSec: Math.floor(process.uptime()) },
      db: { ok: isDbHealthy(deps.db), path: deps.db.path },
      docker,
      helper: { available: helper },
      storage: { supported: storage.supported, reason: storage.reason },
      dataSafety: { sdbUntouched: true, destructiveOps: "disabled" },
    };
  });
}
