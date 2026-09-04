import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/app.js";

function tempDb(): string {
  return join(mkdtempSync(join(tmpdir(), "serveros-")), "test.sqlite");
}

test("admin route is forbidden for default viewer role (fail-closed stub)", async () => {
  const { app } = await buildApp({ dbPath: tempDb(), allowRoleHeader: false });
  try {
    const res = await app.inject({ method: "GET", url: "/api/v1/admin/ping" });
    assert.equal(res.statusCode, 403);
    assert.match((res.json() as { message: string }).message, /system\.manage/);
  } finally {
    await app.close();
  }
});

test("role header is ignored unless explicitly enabled", async () => {
  const { app } = await buildApp({ dbPath: tempDb(), allowRoleHeader: false });
  try {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/ping",
      headers: { "x-serveros-role": "admin" },
    });
    assert.equal(res.statusCode, 403);
  } finally {
    await app.close();
  }
});

test("admin role passes requirePerm when header mode enabled (dev/test)", async () => {
  const { app } = await buildApp({ dbPath: tempDb(), allowRoleHeader: true });
  try {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/ping",
      headers: { "x-serveros-role": "admin" },
    });
    assert.equal(res.statusCode, 200);
  } finally {
    await app.close();
  }
});

test("unknown endpoints return safe 404 envelope", async () => {
  const { app } = await buildApp({ dbPath: tempDb() });
  try {
    const res = await app.inject({ method: "GET", url: "/api/v1/nope" });
    assert.equal(res.statusCode, 404);
    assert.equal((res.json() as { error: string }).error, "notFound");
  } finally {
    await app.close();
  }
});
