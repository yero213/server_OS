import { dirname, join } from "node:path";
import { writeFileSync, chmodSync } from "node:fs";
import { buildApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { AuthService } from "./services/authService.js";

const { app, db } = await buildApp();

// First-run setup token: written to a restricted file, NEVER logged.
try {
  const svc = new AuthService(db.db!);
  if (!svc.hasAnyAdmin()) {
    const token = svc.issueSetupToken();
    const tokenPath = join(dirname(db.path), "setup-token.txt");
    writeFileSync(tokenPath, token + "\n", { mode: 0o600 });
    chmodSync(tokenPath, 0o600);
    logger.info({ tokenPath }, "no admin exists yet: setup token written to file (value not logged)");
  }
} catch (err) {
  logger.error({ err }, "failed to prepare first-run setup token");
}

try {
  await app.listen({ host: config.host, port: config.port });
  logger.info({ host: config.host, port: config.port }, "serveros-api listening (phase-1-bootstrap)");
} catch (err) {
  logger.error({ err }, "failed to start serveros-api");
  process.exit(1);
}
