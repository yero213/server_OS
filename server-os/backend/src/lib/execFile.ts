import { execFile as nodeExecFile } from "node:child_process";

/**
 * Allowlisted, shell-free command execution.
 * - The shell option is never enabled anywhere in this repo.
 * - Only exact binary + fixed arg arrays from internal call sites.
 * - Timeout + maxBuffer enforced so stale NFS never hangs the API.
 */
export class ExecDenied extends Error {}

const READONLY_BINARIES = new Set([
  "lsblk",
  "blkid",
  "df",
  "findmnt",
  "docker",
  "uname",
  "cat",
]);

export function execFileAllowlisted(
  binary: string,
  args: readonly string[],
  opts: { timeoutMs?: number } = {},
): Promise<{ stdout: string; stderr: string }> {
  if (!READONLY_BINARIES.has(binary)) {
    return Promise.reject(new ExecDenied(`binary not allowlisted: ${binary}`));
  }
  if (args.some((a) => typeof a !== "string" || a.includes("\0"))) {
    return Promise.reject(new ExecDenied("invalid argument"));
  }
  return new Promise((resolve, reject) => {
    nodeExecFile(
      binary,
      [...args],
      {
        timeout: opts.timeoutMs ?? 5000,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      },
      (err, stdout, stderr) => {
        if (err) {
          const code = (err as NodeJS.ErrnoException).code ?? "EUNKNOWN";
          reject(new Error(`${binary} failed (${code}): ${String(stderr ?? err.message).slice(0, 300)}`));
          return;
        }
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}
