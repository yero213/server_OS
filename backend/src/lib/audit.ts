import type { DbHandle } from "../db.js";

export type AuditLogger = (
  actor: string,
  action: string,
  target: string | null,
  result: string,
) => void;

export function makeAuditLogger(db: DbHandle): AuditLogger {
  return (actor, action, target, result) => {
    try {
      db.db
        ?.prepare("INSERT INTO audit_log (actor, action, target, result) VALUES (?, ?, ?, ?)")
        .run(actor, action, target, result);
    } catch {
      /* audit logging must never crash a request */
    }
  };
}
