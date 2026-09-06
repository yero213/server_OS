# Phase 2 — Authentication

## First-run setup
1. Boot the API. If no admin exists, a single-use setup token is written to
   `<db-dir>/setup-token.txt` (mode 0600) — `/var/lib/serveros/setup-token.txt`
   in production. **Never logged.** Retrieve with `sudo cat`.
2. `POST /api/v1/auth/setup { setupToken, username, password }` — password ≥ 12 chars.
   Token expires after 30 min, single-use. Delete the file after use.
3. `POST /api/v1/auth/login` / `POST /api/v1/auth/logout` / `GET /api/v1/auth/me`.

## Security choices
- Argon2id via `hash-wasm` (WASM, no native build — same rationale as `node:sqlite`, §20).
- Opaque random session tokens (32 bytes); only the SHA-256 hash is stored (§12: no JWT).
- Cookie: `HttpOnly`, `SameSite=Strict`, `Secure` (disable only via `COOKIE_INSECURE_DEV=1`
  for local http:// dev — never set in production).
- Rate limits: login 10/15min, setup 5/15min, per client IP (via trusted `X-Forwarded-For`
  from Caddy).
- `auth.setup` / `auth.login` / `auth.logout` write to the existing `audit_log` table.

## Deliberately NOT done in this increment
- Existing read routes (`/api/v1/system/info`, `/api/v1/storage/*`) are **still**
  reachable anonymously as `viewer`, same as Phase 1 — no frontend login page exists
  yet, so flipping this now would lock out the dashboard with no way back in.
- No user management CRUD beyond the first admin, no password change/reset, no
  session-expiry sweep job (expired sessions are pruned lazily on lookup), no
  IP/metadata columns on `audit_log`.
