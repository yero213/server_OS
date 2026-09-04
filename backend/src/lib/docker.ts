import { execFileAllowlisted } from "./execFile.js";

export interface DockerStatus {
  available: boolean;
  version: string | null;
  error: string | null;
}

/** Read-only Docker detection: `docker info` with JSON format. No state changes. */
export async function getDockerStatus(): Promise<DockerStatus> {
  try {
    const { stdout } = await execFileAllowlisted(
      "docker",
      ["info", "--format", "{{json .}}"],
      { timeoutMs: 5000 },
    );
    const parsed = JSON.parse(stdout) as { ServerVersion?: unknown };
    const version =
      typeof parsed.ServerVersion === "string" ? parsed.ServerVersion : "unknown";
    return { available: true, version, error: null };
  } catch (err) {
    return {
      available: false,
      version: null,
      error: err instanceof Error ? err.message : "docker unavailable",
    };
  }
}
