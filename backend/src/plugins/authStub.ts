import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
} from "fastify";
import {
  ROLE_PERMISSIONS,
  type Permission,
  type Role,
} from "@serveros/contracts";

declare module "fastify" {
  interface FastifyRequest {
    role: Role;
  }
}

/**
 * Phase 1 permission stub (sessions arrive in Phase 3).
 * Default role is `viewer`. The `x-serveros-role` header is honoured ONLY
 * when ALLOW_ROLE_HEADER=1 (dev/test). Production always sees `viewer`
 * until real authentication lands — fail-closed by construction.
 */
export async function registerAuthStub(
  app: FastifyInstance,
  opts: { allowRoleHeader: boolean },
): Promise<void> {
  app.addHook("onRequest", (req: FastifyRequest, _reply, done) => {
    let role: Role = "viewer";
    if (opts.allowRoleHeader) {
      const header = req.headers["x-serveros-role"];
      const candidate = Array.isArray(header) ? header[0] : header;
      if (candidate === "admin" || candidate === "user" || candidate === "viewer") {
        role = candidate;
      }
    }
    req.role = role;
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
