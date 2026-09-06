import Fastify from "fastify";
import { config } from "./config.js";
import { initDb, type DbHandle } from "./db.js";
import { registerErrorHandling } from "./plugins/errors.js";
import { registerSessionAuth } from "./plugins/session.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerStorageRoutes } from "./routes/storage.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { makeAuditLogger } from "./lib/audit.js";

export interface BuiltApp {
  app: ReturnType<typeof Fastify>;
  db: DbHandle;
}

export async function buildApp(overrides: Partial<typeof config> = {}): Promise<BuiltApp> {
  const app = Fastify({
    logger: { level: overrides.logLevel ?? config.logLevel },
    // API is loopback-only behind Caddy; trust its X-Forwarded-For so
    // per-client rate limiting doesn't bucket everyone as 127.0.0.1.
    trustProxy: true,
  });
  const db = initDb(overrides.dbPath ?? config.dbPath);
  const audit = makeAuditLogger(db);

  await registerErrorHandling(app);
  await registerSessionAuth(app, {
    db,
    allowRoleHeader: overrides.allowRoleHeader ?? config.allowRoleHeader,
  });
  await registerHealthRoutes(app, { db });
  await registerAuthRoutes(app, {
    db,
    cookieSecure: overrides.cookieSecure ?? config.cookieSecure,
    audit,
  });
  await registerStorageRoutes(app);
  await registerAdminRoutes(app);

  return { app, db };
}
