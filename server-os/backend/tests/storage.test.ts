import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/app.js";

function tempDb(): string {
  return join(mkdtempSync(join(tmpdir(), "serveros-")), "test.sqlite");
}

test("storage discovery is read-only and degrades off-Linux", async () => {
  const { app } = await buildApp({ dbPath: tempDb() });
  try {
    for (const url of [
      "/api/v1/storage/disks",
      "/api/v1/storage/mounts",
      "/api/v1/storage/usage",
    ]) {
      const res = await app.inject({ method: "GET", url });
      assert.equal(res.statusCode, 200, url);
      const body = res.json() as { supported: boolean };
      assert.equal(typeof body.supported, "boolean");
      if (process.platform !== "linux") assert.equal(body.supported, false);
    }
  } finally {
    await app.close();
  }
});

for (const operation of ["format", "partition", "wipe", "mkfs", "destroy", "resize", "mount", "unmount"]) {
  test(`POST /api/v1/storage/${operation} -> 501 disabledInMvp`, async () => {
    const { app } = await buildApp({ dbPath: tempDb() });
    try {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/storage/${operation}`,
        payload: { device: "/dev/sdb" },
      });
      assert.equal(res.statusCode, 501);
      const body = res.json() as { error: string; operation: string };
      assert.equal(body.error, "disabledInMvp");
      assert.equal(body.operation, operation);
    } finally {
      await app.close();
    }
  });
}

test("any other storage mutation method -> 501 (catch-all)", async () => {
  const { app } = await buildApp({ dbPath: tempDb() });
  try {
    const res = await app.inject({ method: "DELETE", url: "/api/v1/storage/disks" });
    assert.equal(res.statusCode, 501);
    const put = await app.inject({ method: "PUT", url: "/api/v1/storage/anything" });
    assert.equal(put.statusCode, 501);
  } finally {
    await app.close();
  }
});
