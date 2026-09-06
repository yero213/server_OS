import type { FastifyInstance } from "fastify";
import { SetupRequest, LoginRequest, type AuthMeResponse } from "@serveros/contracts";
import type { DbHandle } from "../db.js";
import { AuthService } from "../services/authService.js";
import { checkRateLimit } from "../lib/rateLimiter.js";
import { readSessionCookie, setSessionCookie, clearSessionCookie } from "../lib/cookies.js";
import type { AuditLogger } from "../lib/audit.js";

export interface AuthDeps {
  db: DbHandle;
  cookieSecure: boolean;
  audit: AuditLogger;
}

const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60;

export async function registerAuthRoutes(app: FastifyInstance, deps: AuthDeps): Promise<void> {
  const svc = new AuthService(deps.db.db!);

  app.get("/api/v1/auth/setup/status", async () => ({ needsSetup: !svc.hasAnyAdmin() }));

  app.post("/api/v1/auth/setup", async (req, reply) => {
    if (!checkRateLimit(`setup:${req.ip}`, 5, 15 * 60 * 1000)) {
      await reply.status(429).send({ error: "rateLimited", message: "Too many setup attempts, try later." });
      return;
    }
    const parsed = SetupRequest.safeParse(req.body);
    if (!parsed.success) {
      await reply.status(400).send({ error: "invalidRequest", message: "Invalid setup payload." });
      return;
    }
    const result = await svc.createFirstAdmin(parsed.data.setupToken, parsed.data.username, parsed.data.password);
    if (!result.ok) {
      deps.audit("anonymous", "auth.setup", parsed.data.username, `failed:${result.reason}`);
      const status = result.reason === "setupAlreadyComplete" ? 409 : 400;
      await reply.status(status).send({ error: result.reason, message: "Setup could not be completed." });
      return;
    }
    const token = svc.createSession(result.user.id);
    setSessionCookie(reply, token, SESSION_MAX_AGE_SEC, deps.cookieSecure);
    deps.audit(result.user.username, "auth.setup", result.user.username, "success");
    await reply.status(201).send({ user: result.user });
  });

  app.post("/api/v1/auth/login", async (req, reply) => {
    if (!checkRateLimit(`login:${req.ip}`, 10, 15 * 60 * 1000)) {
      await reply.status(429).send({ error: "rateLimited", message: "Too many login attempts, try later." });
      return;
    }
    const parsed = LoginRequest.safeParse(req.body);
    if (!parsed.success) {
      await reply.status(400).send({ error: "invalidRequest", message: "Invalid login payload." });
      return;
    }
    const user = await svc.verifyLogin(parsed.data.username, parsed.data.password);
    if (!user) {
      deps.audit(parsed.data.username, "auth.login", parsed.data.username, "failed");
      await reply.status(401).send({ error: "invalidCredentials", message: "Invalid username or password." });
      return;
    }
    const token = svc.createSession(user.id);
    setSessionCookie(reply, token, SESSION_MAX_AGE_SEC, deps.cookieSecure);
    deps.audit(user.username, "auth.login", user.username, "success");
    await reply.send({ user });
  });

  app.post("/api/v1/auth/logout", async (req, reply) => {
    const token = readSessionCookie(req);
    if (token) svc.destroySession(token);
    clearSessionCookie(reply, deps.cookieSecure);
    deps.audit(req.username ?? "anonymous", "auth.logout", null, "success");
    await reply.status(204).send();
  });

  app.get("/api/v1/auth/me", async (req, reply) => {
    const body: AuthMeResponse =
      req.userId !== null
        ? { authenticated: true, user: { id: req.userId, username: req.username!, role: req.role } }
        : { authenticated: false, user: null };
    await reply.send(body);
  });
}
