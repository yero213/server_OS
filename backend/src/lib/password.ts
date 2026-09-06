import { argon2id, argon2Verify } from "hash-wasm";
import { randomBytes } from "node:crypto";

// Tuned conservatively for the Dell control node (i5-4210U, 8 GB RAM).
const OPTS = { parallelism: 1, iterations: 3, memorySize: 19456, hashLength: 32 } as const;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return argon2id({ password, salt, ...OPTS, outputType: "encoded" });
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  try {
    return await argon2Verify({ password, hash: encodedHash });
  } catch {
    return false;
  }
}
