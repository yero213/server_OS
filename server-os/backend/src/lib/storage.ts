import { execFileAllowlisted } from "./execFile.js";

export interface StorageOverview {
  supported: boolean;
  reason: string | null;
  devices: Record<string, unknown>[];
  mounts: Record<string, unknown>[];
  usage: Record<string, unknown>[];
}

const LSBLK_COLS =
  "NAME,PATH,SIZE,MODEL,SERIAL,TRAN,TYPE,FSTYPE,MOUNTPOINT,UUID";

/** Read-only storage discovery (Linux only). No format/partition/mount calls. */
export async function getStorageOverview(): Promise<StorageOverview> {
  if (process.platform !== "linux") {
    return {
      supported: false,
      reason: `read-only discovery requires Linux (current platform: ${process.platform})`,
      devices: [],
      mounts: [],
      usage: [],
    };
  }
  const [lsblk, mounts, usage] = await Promise.all([
    safeJson(async () => {
      const { stdout } = await execFileAllowlisted("lsblk", [
        "-J",
        "-b",
        "-o",
        LSBLK_COLS,
      ]);
      const parsed = JSON.parse(stdout) as {
        blockdevices?: Record<string, unknown>[];
      };
      return Array.isArray(parsed.blockdevices) ? parsed.blockdevices : [];
    }),
    safeJson(async () => {
      const { stdout } = await execFileAllowlisted("findmnt", [
        "-J",
        "-R",
        "-o",
        "TARGET,SOURCE,FSTYPE,OPTIONS",
      ]);
      const parsed = JSON.parse(stdout) as {
        filesystems?: Record<string, unknown>[];
      };
      return Array.isArray(parsed.filesystems) ? parsed.filesystems : [];
    }),
    safeJson(async () => {
      const { stdout } = await execFileAllowlisted("df", [
        "-B1",
        "--output=source,fstype,size,used,avail,target",
        "-x",
        "tmpfs",
        "-x",
        "devtmpfs",
      ]);
      return stdout
        .split("\n")
        .slice(1)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [source, fstype, size, used, avail, ...target] = line.split(/\s+/);
          return { source, fstype, size, used, avail, target: target.join(" ") };
        });
    }),
  ]);
  return { supported: true, reason: null, devices: lsblk, mounts, usage };
}

async function safeJson(
  fn: () => Promise<Record<string, unknown>[]>,
): Promise<Record<string, unknown>[]> {
  try {
    return await fn();
  } catch {
    return [];
  }
}
