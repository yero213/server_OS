import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/app.js";
import { AuthService } from "../src/services/authService.js";
import { __resetRateLimitsForTests } from "../src/lib/rateLimiter.js";

function tempDb(): string {
  return join(mkdtempSync(join(tmpdir(), "serveros-")), "test.sqlite");
}
function setCookie(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers["set-cookie"];
  return Array.isArray(raw) ? (raw[0] as string) : (raw as string);
}

__resetRateLimitsForTests();

test("setup status reports needsSetup=true before first admin exists", async () => {
  const { app } = await buildApp({ dbPath: tempDb() });
  try {
    const res = await app.inject({ method: "GET", url: "/api/v1/auth/setup/status" });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().needsSetup, true);
  } finally {
    await app.close();
  }
});

test("first-run setup creates admin, sets a session cookie, and blocks a second run", async () => {
  const { app, db } = await buildApp({ dbPath: tempDb(), cookieSecure: false });
  try {
    const svc = new AuthService(db.db!);
    const token = svc.issueSetupToken();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/setup",
      payload: { setupToken: token, username: "admin", password: "correct horse battery staple" },
    });
    assert.equal(res.statusCode, 201);
    assert.ok(setCookie(res).includes("serveros_session="));

    const second = await app.inject({
      method: "POST",
      url: "/api/v1/auth/setup",
      payload: { setupToken: token, username: "admin2", password: "correct horse battery staple" },
    });
    assert.equal(second.statusCode, 409);
  } finally {
    await app.close();
  }
});

test("login grants a session that satisfies admin.ping, logout revokes it", async () => {
  const { app, db } = await buildApp({ dbPath: tempDb(), cookieSecure: false });
  try {
    const svc = new AuthService(db.db!);
    const token = svc.issueSetupToken();
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/setup",
      payload: { setupToken: token, username: "admin", password: "correct horse battery staple" },
    });
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "admin", password: "correct horse battery staple" },
    });
    assert.equal(login.statusCode, 200);
    const cookie = setCookie(login);

    const ping = await app.inject({ method: "GET", url: "/api/v1/admin/ping", headers: { cookie } });
    assert.equal(ping.statusCode, 200);

    await app.inject({ method: "POST", url: "/api/v1/auth/logout", headers: { cookie } });
    const after = await app.inject({ method: "GET", url: "/api/v1/admin/ping", headers: { cookie } });
    assert.equal(after.statusCode, 403); // back to default viewer
  } finally {
    await app.close();
  }
});

test("wrong password and unknown username return identical 401s", async () => {
  const { app, db } = await buildApp({ dbPath: tempDb(), cookieSecure: false });
  try {
    const svc = new AuthService(db.db!);
    const token = svc.issueSetupToken();
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/setup",
      payload: { setupToken: token, username: "admin", password: "correct horse battery staple" },
    });
    const badPassword = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "admin", password: "wrong" },
    });
    const badUsername = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "ghost", password: "wrong" },
    });
    assert.equal(badPassword.statusCode, 401);
    assert.equal(badUsername.statusCode, 401);
    assert.deepEqual(badPassword.json(), badUsername.json());
  } finally {
    await app.close();
  }
});

test("login is rate-limited after repeated failures from the same client", async () => {
  __resetRateLimitsForTests();
  const { app } = await buildApp({ dbPath: tempDb(), cookieSecure: false });
  try {
    let last = 0;
    for (let i = 0; i < 12; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { username: "nobody", password: "nope" },
      });
      last = res.statusCode;
    }
    assert.equal(last, 429);
  } finally {
    await app.close();
  }
});
