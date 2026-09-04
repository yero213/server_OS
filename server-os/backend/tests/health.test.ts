import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HealthResponse } from "@serveros/contracts";
import { buildApp } from "../src/app.js";

function tempDb(): string {
  return join(mkdtempSync(join(tmpdir(), "serveros-")), "test.sqlite");
}

test("GET /api/v1/health returns versioned status incl. docker + dataSafety", async () => {
  const { app } = await buildApp({ dbPath: tempDb() });
  try {
    const res = await app.inject({ method: "GET", url: "/api/v1/health" });
    assert.equal(res.statusCode, 200);
    const body = HealthResponse.parse(res.json());
    assert.equal(body.ok, true);
    assert.equal(body.phase, "phase-1-bootstrap");
    assert.equal(typeof body.docker.available, "boolean");
    assert.equal(body.dataSafety.sdbUntouched, true);
    assert.equal(body.dataSafety.destructiveOps, "disabled");
    assert.equal(body.db.ok, true);
  } finally {
    await app.close();
  }
});

test("GET /api/v1/system/info exposes cpu/ram without privileges", async () => {
  const { app } = await buildApp({ dbPath: tempDb() });
  try {
    const res = await app.inject({ method: "GET", url: "/api/v1/system/info" });
    assert.equal(res.statusCode, 200);
    const body = res.json() as Record<string, unknown>;
    assert.equal(typeof body.cpuCount, "number");
    assert.equal(typeof body.memTotalBytes, "number");
  } finally {
    await app.close();
  }
});
