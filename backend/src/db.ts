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

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull(),
  createdAt: text("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tokenHash: text("token_hash").notNull().unique(),
  userId: integer("user_id").notNull(),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const setupTokens = sqliteTable("setup_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
});

export interface DbHandle {
  ok: boolean;
  path: string;
  db: DatabaseSync | null;
}

const MIGRATIONS = ["0001_init.sql", "0002_auth.sql"] as const;

function loadMigrationSql(filename: string): string {
  // Works both under tsx (src/) and compiled output (dist/).
  const candidates = [
    new URL(`../../drizzle/${filename}`, import.meta.url),
    new URL(`../drizzle/${filename}`, import.meta.url),
  ];
  for (const url of candidates) {
    try {
      return readFileSync(url, "utf8");
    } catch {
      /* try next candidate */
    }
  }
  throw new Error(`drizzle/${filename} not found`);
}

/** Idempotent SQLite initialisation (WAL, 0700 dir). No destructive ops. */
export function initDb(dbPath: string = config.dbPath): DbHandle {
  mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
  const client = new DatabaseSync(dbPath);
  client.exec("PRAGMA journal_mode = WAL;");

  for (const filename of MIGRATIONS) {
    client.exec(loadMigrationSql(filename));
    const name = filename.replace(/\.sql$/, "");
    client
      .prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES (?)")
      .run(name);
  }

  // Drizzle schema-as-code guard: every declared table must exist.
  for (const table of [schemaMigrations, auditLog, users, sessions, setupTokens]) {
    const name = getTableConfig(table).name;
    const row = client
      .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name=?")
      .get(name) as { n: number };
    if (row.n !== 1) throw new Error(`schema mismatch: table ${name} missing`);
  }

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
