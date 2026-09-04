import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { chmodSync, existsSync, unlinkSync } from "node:fs";
import { release, uptime, loadavg, totalmem, freemem } from "node:os";
import { execFileAllowlisted } from "./lib/execFile.js";
import { logger } from "./logger.js";

/**
 * serveros-helper — root-only companion service (Phase 1: READ-ONLY).
 * Listens on a root-owned Unix socket (0600). Exposes GET endpoints only;
 * any other method → 405. No mount/format/partition code exists here.
 *
 * Production: systemd socket /run/serveros/helper.sock (User=root).
 * Dev/test: HELPER_PORT=3999 fallback on 127.0.0.1 (still read-only GET).
 */

const SOCKET = process.env.HELPER_SOCKET ?? "/run/serveros/helper.sock";
const PORT = Number(process.env.HELPER_PORT ?? "0");

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function runJson(binary: string, args: readonly string[]): Promise<unknown> {
  const { stdout } = await execFileAllowlisted(binary, args, { timeoutMs: 5000 });
  return JSON.parse(stdout) as unknown;
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  void (async () => {
    if (req.method !== "GET") {
      send(res, 405, { error: "methodNotAllowed", message: "Helper is read-only (GET only)." });
      return;
    }
    const url = new URL(req.url ?? "/", "http://helper.local");
    if (url.pathname === "/v1/health") {
      send(res, 200, { ok: true, service: "serveros-helper", phase: "phase-1-bootstrap" });
      return;
    }
    if (url.pathname === "/v1/system/info") {
      send(res, 200, {
        platform: process.platform,
        release: release(),
        uptimeSec: Math.floor(uptime()),
        loadAvg1: loadavg()[0] ?? 0,
        memTotalBytes: totalmem(),
        memFreeBytes: freemem(),
      });
      return;
    }
    if (url.pathname === "/v1/storage/disks") {
      if (process.platform !== "linux") {
        send(res, 200, { supported: false, reason: "helper storage requires Linux", devices: [] });
        return;
      }
      try {
        const parsed = (await runJson("lsblk", [
          "-J",
          "-b",
          "-o",
          "NAME,PATH,SIZE,MODEL,SERIAL,TRAN,TYPE,FSTYPE,MOUNTPOINT,UUID",
        ])) as { blockdevices?: unknown[] };
        send(res, 200, {
          supported: true,
          reason: null,
          devices: parsed.blockdevices ?? [],
        });
      } catch (err) {
        send(res, 500, {
          error: "helperError",
          message: err instanceof Error ? err.message : "lsblk failed",
        });
      }
      return;
    }
    send(res, 404, { error: "notFound", message: "Unknown helper endpoint." });
  })();
});

if (process.platform === "linux" && !PORT) {
  try {
    if (existsSync(SOCKET)) unlinkSync(SOCKET);
  } catch {
    /* fresh start */
  }
  server.listen(SOCKET, () => {
    chmodSync(SOCKET, 0o600);
    logger.info({ socket: SOCKET }, "serveros-helper listening (root, read-only)");
  });
} else {
  const port = PORT || 3999;
  server.listen(port, "127.0.0.1", () => {
    logger.info({ port }, "serveros-helper listening on loopback (dev/test, read-only)");
  });
}
