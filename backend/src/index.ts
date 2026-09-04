import { buildApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

const { app } = await buildApp();

try {
  await app.listen({ host: config.host, port: config.port });
  logger.info(
    { host: config.host, port: config.port },
    "serveros-api listening (phase-1-bootstrap)",
  );
} catch (err) {
  logger.error({ err }, "failed to start serveros-api");
  process.exit(1);
}
