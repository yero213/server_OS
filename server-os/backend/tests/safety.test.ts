import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const backendSrc = join(here, "..", "src");
const installerDir = join(here, "..", "..", "installer");

function allFiles(dir: string, exts: string[]): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out = out.concat(allFiles(full, exts));
    else if (exts.some((e) => full.endsWith(e))) out.push(full);
  }
  return out;
}

/**
 * Static safety net: destructive storage binaries must not appear in
 * backend source or installer scripts (MVP = read + mount discovery only).
 * If a future phase needs them, THIS test must be updated deliberately.
 */
test("no destructive storage tooling in backend/src or installer/*.sh", () => {
  const targets = [
    ...allFiles(backendSrc, [".ts"]),
    ...allFiles(installerDir, [".sh"]),
  ];
  assert.ok(targets.length > 0, "expected source files to scan");
  const banned = [
    "mkfs",
    "wipefs",
    "parted",
    "sgdisk",
    "sfdisk",
    "fdisk",
    "mkswap",
    "cryptsetup",
    "shred",
  ];
  const violations: string[] = [];
  for (const file of targets) {
    const content = readFileSync(file, "utf8");
    for (const word of banned) {
      const re = new RegExp(`\\b${word}\\b`);
      if (re.test(content)) violations.push(`${file}: ${word}`);
    }
  }
  assert.deepEqual(violations, []);
});

/** The API must never spawn a shell or use shell string execution. */
test("no shell execution in backend/src", () => {
  const targets = allFiles(backendSrc, [".ts"]);
  const violations: string[] = [];
  for (const file of targets) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const code = line.split("//")[0];
      if (/shell\s*:\s*true/.test(code)) {
        violations.push(`${file}:${i + 1}: shell:true`);
      }
      // child_process-style invocation, but not member calls (db.exec)
      // and not the single wrapped call site inside the allowlist module.
      if (
        /(?<!\.)\b(exec|execFile|spawn|spawnSync|fork)\s*\(/.test(code) &&
        !code.includes("execFileAllowlisted") &&
        !code.includes("nodeExecFile(")
      ) {
        violations.push(`${file}:${i + 1}: raw process spawn`);
      }
      if (/\bexecSync\s*\(/.test(code)) violations.push(`${file}:${i + 1}: execSync`);
    });
  }
  assert.deepEqual(violations, []);
});

/** /dev/sdb must never be referenced as a target in code or installer. */
test("no hardcoded /dev/sdX mutation targets", () => {
  const targets = [
    ...allFiles(backendSrc, [".ts"]),
    ...allFiles(installerDir, [".sh"]),
  ];
  const violations: string[] = [];
  for (const file of targets) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      // Comments and docs are fine; only executable references count.
      if (
        trimmed.startsWith("//") ||
        trimmed.startsWith("#") ||
        trimmed.startsWith("*") ||
        trimmed.startsWith("<!--")
      ) {
        return;
      }
      // Flag only executable references to /dev/sdX near storage verbs.
      if (
        /\/dev\/sd[a-z]/.test(line) &&
        /mount|format|wipe|partition|mkfs|export|UUID/i.test(line)
      ) {
        violations.push(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`);
      }
    });
  }
  assert.deepEqual(violations, []);
});
