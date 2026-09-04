import { request as httpRequest } from "node:http";
import { existsSync } from "node:fs";
import { config } from "../config.js";

function get(path: string, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const useSocket =
      process.platform === "linux" && existsSync(config.helperSocket);
    const req = httpRequest(
      useSocket
        ? { socketPath: config.helperSocket, path, method: "GET", timeout: timeoutMs }
        : {
            host: "127.0.0.1",
            port: config.helperPort || 3999,
            path,
            method: "GET",
            timeout: timeoutMs,
          },
      (res) => {
        res.resume();
        resolve(res.statusCode !== undefined && res.statusCode < 500);
      },
    );
    req.on("timeout", () => resolve(false));
    req.on("error", () => resolve(false));
    req.end();
  });
}

/** Probe the root-only helper without ever sending it mutating requests. */
export async function isHelperAvailable(): Promise<boolean> {
  if (process.platform === "linux" && !existsSync(config.helperSocket)) {
    if (!config.helperPort) return false;
  }
  if (process.platform !== "linux" && !config.helperPort) return false;
  return get("/v1/health");
}
