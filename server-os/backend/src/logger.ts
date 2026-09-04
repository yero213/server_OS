import pino from "pino";
import { config } from "./config.js";

export const logger = pino({
  level: config.logLevel,
  base: { service: "serveros-api", phase: "phase-1-bootstrap" },
  timestamp: pino.stdTimeFunctions.isoTime,
});
