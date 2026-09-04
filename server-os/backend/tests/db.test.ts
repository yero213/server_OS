import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initDb, isDbHealthy } from "../src/db.js";

test("sqlite initialises idempotently with migrations + audit tables", async () => {
  const dir = mkdtempSync(join(tmpdir(), "serveros-"));
  const path = join(dir, "serveros.sqlite");
  const first = initDb(path);
  assert.equal(isDbHealthy(first), true);
  // Second init on the same file must not fail or duplicate.
  const second = initDb(path);
  assert.equal(isDbHealthy(second), true);
  const row = second.db!
    .prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE name='0001_init'")
    .get() as { n: number };
  assert.equal(row.n, 1);
});
