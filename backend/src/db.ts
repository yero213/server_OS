import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { sqliteTable, text, integer, getTableConfig } from "drizzle-orm/sqlite-core";
import { config } from "./config.js";

export const schemaMigrations = sqliteTable("schema_migrations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  appliedAt: text("applied_at").notNull(),
});

export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ts: text("ts").notNull(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target"),
  result: text("result").notNull(),
});

export interface DbHandle {
  ok: boolean;
  path: string;
  db: DatabaseSync | null;
}

function loadInitSql(): string {
  // Works both under tsx (src/) and compiled output (dist/).
  const candidates = [
    new URL("../../drizzle/0001_init.sql", import.meta.url),
    new URL("../drizzle/0001_init.sql", import.meta.url),
  ];
  let lastErr: unknown = null;
  for (const url of candidates) {
    try {
      return readFileSync(url, "utf8");
    } catch (err) {
      // Remember, don't swallow: EACCES (unreadable dir) must not
      // masquerade as a missing file (cost us a real incident).
      lastErr = err;
    }
  }
  const detail = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(`drizzle/0001_init.sql not found (${detail})`);
}

/** Idempotent SQLite initialisation (WAL, 0700 dir). No destructive ops. */
export function initDb(dbPath: string = config.dbPath): DbHandle {
  mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
  const client = new DatabaseSync(dbPath);
  client.exec("PRAGMA journal_mode = WAL;");
  client.exec(loadInitSql());
  // Drizzle schema-as-code guard: every declared table must exist.
  // (drizzle-orm 0.44 ships no node:sqlite driver, so the runtime stays on
  // node:sqlite directly; the query-builder wiring follows when a driver
  // exists. Schema definitions remain the single source of truth.)
  for (const table of [schemaMigrations, auditLog]) {
    const name = getTableConfig(table).name;
    const row = client
      .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name=?")
      .get(name) as { n: number };
    if (row.n !== 1) throw new Error(`schema mismatch: table ${name} missing`);
  }
  client.exec(
    "INSERT OR IGNORE INTO schema_migrations (name) VALUES ('0001_init')",
  );
  return { ok: true, path: dbPath, db: client };
}

export function isDbHealthy(handle: DbHandle): boolean {
  try {
    if (!handle.db) return false;
    const row = handle.db
      .prepare("SELECT COUNT(*) AS n FROM schema_migrations")
      .get() as { n: number };
    return typeof row.n === "number";
  } catch {
    return false;
  }
}
