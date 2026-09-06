import type { DatabaseSync } from "node:sqlite";
import type { Role } from "@serveros/contracts";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { generateToken, hashToken } from "../lib/sessionToken.js";

const SETUP_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 min, single-use
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface SessionUser {
  id: number;
  username: string;
  role: Role;
}

// Fixed dummy value so a login for an unknown username still does hashing
// work of roughly the same shape, reducing (not eliminating) a timing
// signal for username enumeration. Not a strong guarantee on its own.
const DUMMY_HASH = "not-a-real-hash";

export class AuthService {
  constructor(private readonly db: DatabaseSync) {}

  hasAnyAdmin(): boolean {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'")
      .get() as { n: number };
    return row.n > 0;
  }

  /** Issues a fresh single-use setup token; invalidates unused prior ones. */
  issueSetupToken(): string {
    this.db.exec("DELETE FROM setup_tokens WHERE used_at IS NULL");
    const token = generateToken();
    const expiresAt = new Date(Date.now() + SETUP_TOKEN_TTL_MS).toISOString();
    this.db
      .prepare("INSERT INTO setup_tokens (token_hash, expires_at) VALUES (?, ?)")
      .run(hashToken(token), expiresAt);
    return token;
  }

  private consumeSetupToken(token: string): boolean {
    const row = this.db
      .prepare("SELECT id, expires_at, used_at FROM setup_tokens WHERE token_hash = ?")
      .get(hashToken(token)) as
      | { id: number; expires_at: string; used_at: string | null }
      | undefined;
    if (!row || row.used_at) return false;
    if (new Date(row.expires_at).getTime() < Date.now()) return false;
    this.db.prepare("UPDATE setup_tokens SET used_at = datetime('now') WHERE id = ?").run(row.id);
    return true;
  }

  async createFirstAdmin(
    setupToken: string,
    username: string,
    password: string,
  ): Promise<{ ok: true; user: SessionUser } | { ok: false; reason: string }> {
    if (this.hasAnyAdmin()) return { ok: false, reason: "setupAlreadyComplete" };
    if (!this.consumeSetupToken(setupToken)) return { ok: false, reason: "invalidSetupToken" };
    const passwordHash = await hashPassword(password);
    try {
      const info = this.db
        .prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')")
        .run(username, passwordHash);
      return { ok: true, user: { id: Number(info.lastInsertRowid), username, role: "admin" } };
    } catch {
      return { ok: false, reason: "usernameTaken" };
    }
  }

  async verifyLogin(username: string, password: string): Promise<SessionUser | null> {
    const row = this.db
      .prepare("SELECT id, username, password_hash, role FROM users WHERE username = ?")
      .get(username) as
      | { id: number; username: string; password_hash: string; role: Role }
      | undefined;
    const valid = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
    if (!row || !valid) return null;
    return { id: row.id, username: row.username, role: row.role };
  }

  createSession(userId: number): string {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    this.db
      .prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
      .run(hashToken(token), userId, expiresAt);
    return token;
  }

  resolveSession(token: string): SessionUser | null {
    const row = this.db
      .prepare(
        `SELECT u.id as id, u.username as username, u.role as role,
                s.expires_at as expires_at, s.id as sid
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ?`,
      )
      .get(hashToken(token)) as
      | { id: number; username: string; role: Role; expires_at: string; sid: number }
      | undefined;
    if (!row) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) {
      this.db.prepare("DELETE FROM sessions WHERE id = ?").run(row.sid);
      return null;
    }
    this.db.prepare("UPDATE sessions SET last_seen_at = datetime('now') WHERE id = ?").run(row.sid);
    return { id: row.id, username: row.username, role: row.role };
  }

  destroySession(token: string): void {
    this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
  }
}
