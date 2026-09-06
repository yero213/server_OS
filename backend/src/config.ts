export const VERSION = "0.1.0";
export const PHASE = "phase-1-bootstrap" as const;

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) ? (parsed as number) : fallback;
}

export const config = {
  port: num("PORT", 3001),
  host: process.env.HOST ?? "127.0.0.1",
  dbPath:
    process.env.DB_PATH ??
    (process.platform === "linux"
      ? "/var/lib/serveros/db.sqlite"
      : "./data/serveros.sqlite"),
  helperSocket:
    process.env.HELPER_SOCKET ?? "/run/serveros/helper.sock",
  /** Dev/test only: allow HelperClient to fall back to 127.0.0.1:HELPER_PORT. */
  helperPort: num("HELPER_PORT", 0),
  logLevel: process.env.LOG_LEVEL ?? "info",
  /** Dev/test only: honour x-serveros-role header. OFF in production. */
  allowRoleHeader: process.env.ALLOW_ROLE_HEADER === "1",
  /**
   * Session cookie `Secure` attribute. ONLY set COOKIE_INSECURE_DEV=1 for
   * local http:// dev without Caddy TLS. NEVER set in production — the
   * systemd unit does not set it, so prod always gets a Secure cookie.
   */
  cookieSecure: process.env.COOKIE_INSECURE_DEV === "1" ? false : true,
};
