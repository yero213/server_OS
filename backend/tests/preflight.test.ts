import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, "..", "..", "installer", "preflight-control.sh");

/**
 * Read-only guarantee for the preflight audit.
 * The script may only OBSERVE (lsblk, blkid, docker info, ss, ufw status,
 * git status, ...). Anything that installs, starts/stops, writes, mounts
 * or reconfigures must fail this test. Quoted labels are stripped before
 * matching so status text cannot trip the scanner (accidental bare
 * commands still match — this is a guard against mistakes, not attacks).
 */
interface CodedLine {
  n: number;
  code: string;
}

function codedLines(): CodedLine[] {
  return readFileSync(script, "utf8")
    .split("\n")
    .map((raw, i) => {
      const trimmed = raw.trim();
      if (trimmed.startsWith("#") || trimmed === "") {
        return { n: i + 1, code: "" };
      }
      let code = raw.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
      const hash = code.indexOf(" #");
      if (hash >= 0) code = code.slice(0, hash);
      // systemctl queries are read-only; drop them before verb matching
      // so `is-enabled`/`is-active` cannot match `enable`.
      code = code.replace(/is-(enabled|active|failed)/g, "");
      // Output sinks that change nothing.
      code = code
        .replace(/2>&1/g, "")
        .replace(/1?>>?\/dev\/null/g, "")
        .replace(/2>>?\/dev\/null/g, "");
      return { n: i + 1, code };
    });
}

const MUTATING_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "destructive disk tooling", re: /\b(mkfs|wipefs|parted|sgdisk|sfdisk|fdisk|mkswap|cryptsetup|shred|dd)\b/ },
  { name: "mount/umount", re: /\b(mount|umount)\b/ },
  { name: "package install", re: /\b(apt-get\s+install|apt\s+install|dpkg\s+-i|snap\s+install)\b/ },
  { name: "service control", re: /\bsystemctl\s+(start|stop|restart|enable|disable|mask|daemon-reload|daemon-reexec)\b/ },
  { name: "sysv service control", re: /\bservice\s+\S+\s+(start|stop|restart|reload)\b/ },
  { name: "mutating docker verb", re: /\bdocker\s+(run|start|stop|restart|rm|rmi|exec|kill|pause|unpause|update|rename|cp|push|pull|build|login|logout)\b/ },
  { name: "mutating compose verb", re: /\bcompose\s+(up|down|start|stop|restart|rm|exec|run|build|push|pull)\b/ },
  { name: "protected path write", re: /\/etc\/(fstab|hosts)/ },
  { name: "output redirection (non-null)", re: />/ },
  { name: "tee", re: /\btee\b/ },
  { name: "firewall change", re: /\bufw\s+(allow|deny|enable|delete|reset|route|default)\b/ },
  { name: "account/owner change", re: /\b(useradd|usermod|userdel|groupadd|groupdel|adduser|addgroup|chown|chmod|chgrp)\b/ },
  { name: "proxy control", re: /\bcaddy\s+(reload|start|stop|restart|trust|untrust)\b/ },
  { name: "power control", re: /\b(reboot|shutdown|poweroff|halt)\b/ },
  { name: "network reconfig", re: /\b(sysctl\s+-w|iptables|\bnft\b|nmcli|netplan\s+apply)\b/ },
  { name: "mutating git verb", re: /\bgit\s+(clone|pull|push|checkout|reset|clean|fetch|merge|rebase)\b/ },
  { name: "sudo escalation", re: /\bsudo\b/ },
  { name: "downloader", re: /\b(curl|wget)\b/ },
  { name: "file removal/creation", re: /\b(rm|mkdir|touch|rmdir)\b/ },
];

test("preflight script performs zero mutations", () => {
  const violations: string[] = [];
  for (const { n, code } of codedLines()) {
    if (!code.trim()) continue;
    for (const { name, re } of MUTATING_PATTERNS) {
      if (re.test(code)) violations.push(`line ${n} [${name}]: ${code.trim().slice(0, 120)}`);
    }
  }
  assert.deepEqual(violations, []);
});

test("preflight audit does not abort on first failing probe", () => {
  const content = readFileSync(script, "utf8");
  assert.ok(content.includes("set -uo pipefail"), "expected `set -uo pipefail`");
  assert.ok(!/set\s+-[a-z]*e/.test(content), "must not use `set -e` (one failing probe must not abort the audit)");
});

const REQUIRED_PROBES = [
  "lsblk",
  "blkid",
  "/dev/sdb",
  "docker info",
  "docker ps",
  "docker compose version",
  "ss -tln",
  "ufw status",
  "status --porcelain",
  "rev-parse",
  "systemctl is-enabled",
  "systemctl is-active",
  "avahi-daemon",
  "umbrel",
  "getent hosts",
  "os-release",
  "df -B1",
  "findmnt",
  "pgrep",
  "node --version",
  "caddy version",
  "tailscale status",
  "tailscaled",
  "tailscale ip",
];

test("preflight covers all required read-only probes", () => {
  const content = readFileSync(script, "utf8");
  const missing = REQUIRED_PROBES.filter((probe) => !content.includes(probe));
  assert.deepEqual(missing, []);
});
