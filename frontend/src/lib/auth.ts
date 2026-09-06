/** Same-origin auth client. Session cookie (HttpOnly) is sent automatically. */

export interface SessionUser {
  id: number;
  username: string;
  role: "admin" | "user" | "viewer";
}

export interface AuthMe {
  authenticated: boolean;
  user: SessionUser | null;
}

async function json(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function getSetupStatus(): Promise<{ needsSetup: boolean }> {
  const res = await fetch("/api/v1/auth/setup/status");
  if (!res.ok) throw new Error("setup status HTTP " + res.status);
  return res.json();
}

export async function getMe(): Promise<AuthMe> {
  const res = await fetch("/api/v1/auth/me");
  if (!res.ok) return { authenticated: false, user: null };
  return res.json();
}

export async function postSetup(
  setupToken: string,
  username: string,
  password: string,
): Promise<{ ok: boolean; status: number; error: string | null }> {
  const res = await fetch("/api/v1/auth/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ setupToken, username, password }),
  });
  if (res.ok) return { ok: true, status: res.status, error: null };
  const body = await json(res);
  return { ok: false, status: res.status, error: body?.error ?? ("HTTP " + res.status) };
}

export async function postLogin(
  username: string,
  password: string,
): Promise<{ ok: boolean; status: number }> {
  const res = await fetch("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return { ok: res.ok, status: res.status };
}

export async function postLogout(): Promise<void> {
  try {
    await fetch("/api/v1/auth/logout", { method: "POST" });
  } catch {
    /* logout is best-effort; session expiry handles the rest */
  }
}
