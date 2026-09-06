import { randomBytes, createHash } from "node:crypto";

/** Opaque random tokens (approved arch §12: no JWT). Only the hash is stored. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
