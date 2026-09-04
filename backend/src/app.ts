import Fastify from "fastify";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { initDb, type DbHandle } from "./db.js";
import { registerErrorHandling } from "./plugins/errors.js";
import { registerAuthStub } from "./plugins/authStub.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerStorageRoutes } from "./routes/storage.js";
import { registerAdminRoutes } from "./routes/admin.js";

export interface BuiltApp {
  app: ReturnType<typeof Fastify>;
  db: DbHandle;
}

export async function buildApp(overrides: Partial<typeof config> = {}): Promise<BuiltApp> {
  // Fastify 5 accepts logger *options* (not an instance); request logs and
  // the shared pino logger use the same level for consistent output.
  const app = Fastify({ logger: { level: overrides.logLevel ?? config.logLevel } });
  const db = initDb(overrides.dbPath ?? config.dbPath);

  await registerErrorHandling(app);
  await registerAuthStub(app, {
    allowRoleHeader: overrides.allowRoleHeader ?? config.allowRoleHeader,
  });
  await registerHealthRoutes(app, { db });
  await registerStorageRoutes(app);
  await registerAdminRoutes(app);

  return { app, db };
}
