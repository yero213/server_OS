import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
} from "fastify";
import { ROLE_PERMISSIONS, type Permission, type Role } from "@serveros/contracts";
import { AuthService } from "../services/authService.js";
import { readSessionCookie } from "../lib/cookies.js";
import type { DbHandle } from "../db.js";

declare module "fastify" {
  interface FastifyRequest {
    role: Role;
    /** Set only for a real logged-in user; null for anonymous/dev-header requests. */
    userId: number | null;
    username: string | null;
  }
}

export interface SessionAuthOpts {
  db: DbHandle;
  /** Dev/test only: honour x-serveros-role header. OFF in production. */
  allowRoleHeader: boolean;
}

/**
 * Resolves the caller's role for each request: real session cookie first,
 * then (dev/test only) the x-serveros-role header, else the Phase 1 default
 * of `viewer`. Existing read-only routes keep working exactly as before;
 * logging in only matters for routes that need more than viewer permissions.
 */
export async function registerSessionAuth(app: FastifyInstance, opts: SessionAuthOpts): Promise<void> {
  const svc = new AuthService(opts.db.db!);

  app.addHook("onRequest", (req: FastifyRequest, _reply: FastifyReply, done) => {
    req.role = "viewer";
    req.userId = null;
    req.username = null;

    const token = readSessionCookie(req);
    if (token) {
      const session = svc.resolveSession(token);
      if (session) {
        req.role = session.role;
        req.userId = session.id;
        req.username = session.username;
        done();
        return;
      }
    }

    if (opts.allowRoleHeader) {
      const header = req.headers["x-serveros-role"];
      const candidate = Array.isArray(header) ? header[0] : header;
      if (candidate === "admin" || candidate === "user" || candidate === "viewer") {
        req.role = candidate;
      }
    }
    done();
  });
}

export function requirePerm(permission: Permission): preHandlerHookHandler {
  return (req: FastifyRequest, reply: FastifyReply, done) => {
    const granted = ROLE_PERMISSIONS[req.role] ?? [];
    if (!(granted as readonly string[]).includes(permission)) {
      void reply.status(403).send({
        error: "forbidden",
        message: `Missing permission: ${permission} (role: ${req.role}).`,
      });
      return;
    }
    done();
  };
}
