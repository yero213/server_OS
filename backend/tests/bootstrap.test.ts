import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const installer = join(here, "..", "..", "installer");
const bootstrap = readFileSync(join(installer, "bootstrap-control.sh"), "utf8");
const apiUnit = readFileSync(join(installer, "systemd", "serveros-api.service"), "utf8");
const helperUnit = readFileSync(join(installer, "systemd", "serveros-helper.service"), "utf8");
const caddyfile = readFileSync(join(installer, "caddy", "Caddyfile.tmpl"), "utf8");
const ufwControl = readFileSync(join(installer, "ufw-control.sh"), "utf8");

/** Executable lines only: full-line comments carry no actions. */
function codeLines(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}
const code = codeLines(bootstrap).join("\n");
const codeLower = code.toLowerCase();

test("bootstrap targets ONLY Ubuntu Server 26.04 x86_64 (Scenario A)", () => {
  for (const needle of ['ID', 'VERSION_ID', '26.04', 'x86_64']) {
    assert.ok(bootstrap.includes(needle), `expected ${needle} gate in bootstrap`);
  }
  assert.ok(/uname\s+-m/.test(bootstrap), "expected uname -m arch gate");
  assert.ok(/Refusing/.test(bootstrap), "expected hard refusal on wrong platform");
});

test("bootstrap installs + enables Tailscale but never joins", () => {
  assert.ok(
    bootstrap.includes("https://pkgs.tailscale.com/stable/ubuntu/"),
    "expected official Tailscale package server",
  );
  assert.ok(
    code.includes("apt-get install -y tailscale"),
    "expected tailscale package install",
  );
  assert.ok(
    code.includes("enable --now tailscaled"),
    "expected tailscaled service enabled",
  );
  assert.ok(!/\btailscale\s+up\b/.test(code), "bootstrap must never join the tailnet");
  assert.ok(!/auth[^a-z]*key/i.test(code), "bootstrap must never ask for an auth key");
});

test("bootstrap installs Node 22, Docker and Caddy from official repos", () => {
  assert.ok(bootstrap.includes("node_22.x"), "expected NodeSource node_22.x");
  assert.ok(
    bootstrap.includes("https://download.docker.com/linux/ubuntu"),
    "expected official Docker apt repo",
  );
  assert.ok(
    bootstrap.includes("docker-ce") && bootstrap.includes("docker-compose-plugin"),
    "expected Docker engine + compose plugin packages",
  );
  assert.ok(
    bootstrap.includes("dl.cloudsmith.io/public/caddy/stable"),
    "expected official Caddy Cloudsmith repo",
  );
  assert.ok(bootstrap.includes("caddy validate"), "expected caddy validate before reload");
});

test("bootstrap creates serveros user, units, firewall and deployments", () => {
  assert.ok(code.includes('SERVICE_USER="serveros"'), "expected serveros user");
  assert.ok(code.includes("usermod -aG docker"), "expected docker-group membership");
  assert.ok(
    code.includes("serveros-api.service") && code.includes("serveros-helper.service"),
    "expected both systemd units",
  );
  assert.ok(code.includes("daemon-reload"), "expected daemon-reload");
  assert.ok(code.includes("enable --now"), "expected enable --now (reboot persistence)");
  assert.ok(code.includes("ufw-control.sh"), "expected firewall delegation");
  assert.ok(ufwControl.includes('allow_once "22/tcp"'), "expected SSH rule");
  assert.ok(ufwControl.includes('allow_once "80/tcp"'), "expected HTTP rule");
  assert.ok(ufwControl.includes('allow_once "443/tcp"'), "expected HTTPS rule");
  assert.ok(
    ufwControl.includes('allow_once "41641/udp"'),
    "expected Tailscale direct-connection port (documented, narrow)",
  );
  assert.ok(code.includes("/opt/server-os/backend-dist"), "expected /opt/server-os deploy");
  assert.ok(
    code.includes("/srv/serveros/frontend"),
    "expected frontend deploy dir",
  );
  assert.ok(code.includes("Caddyfile"), "expected Caddy config deploy");
  assert.ok(
    apiUnit.includes("DB_PATH=/var/lib/serveros/db.sqlite") &&
      apiUnit.includes("ReadWritePaths=/var/lib/serveros"),
    "expected SQLite state dir wiring (DB created on first API boot)",
  );
  assert.ok(
    caddyfile.includes("tls internal") && caddyfile.includes("127.0.0.1:3001"),
    "expected internal TLS + loopback API proxy",
  );
  // Helper socket must be dialable by the API service user: root:serveros
  // 0660. A root:root 0600 socket locks the API out (EACCES) while the
  // helper itself reports healthy — exactly the Dell false-negative.
  assert.ok(
    helperUnit.includes("Group=serveros"),
    "expected helper unit to run with Group=serveros",
  );
  const helperSrc = readFileSync(
    join(installer, "..", "backend", "src", "helper.ts"),
    "utf8",
  );
  assert.ok(
    helperSrc.includes("0o660"),
    "expected helper socket mode 0660 (never root-only 0600)",
  );
  for (const unit of [apiUnit, helperUnit]) {
    assert.ok(unit.includes("WantedBy=multi-user.target"), "expected boot enablement");
    assert.ok(unit.includes("Restart=always"), "expected restart policy");
  }
});

test("bootstrap ships backend bundle completely and keeps checkout usable", () => {
  // Regression test for the Dell crash (exit 1, restart loop):
  // dist/db.js resolves ../drizzle/0001_init.sql, i.e. one level UP from
  // backend-dist, so the migrations dir must be deployed as its SIBLING
  // /opt/server-os/drizzle (whole dir, future-proof).
  assert.ok(
    code.includes("backend/drizzle") && code.includes("/opt/server-os/drizzle"),
    "expected drizzle migrations deployed as sibling of backend-dist",
  );
  // EACCES on an unreadable dir surfaced as "not found" on the Dell:
  // the service user must traverse the drizzle dir, and stale 0750
  // checkout dirs (invisible to git) must be repaired.
  assert.ok(
    code.includes('chown -R "root:$SERVICE_USER" /opt/server-os/backend-dist /opt/server-os/backend-package.json /opt/server-os/drizzle'),
    "expected drizzle dir owned traversable by service user",
  );
  assert.ok(
    code.includes('find "$REPO_DIR" -type d'),
    "expected checkout dir-mode repair",
  );
  // Deploy dir is rebuilt from scratch: plain cp -r would nest dist/ on re-run.
  assert.ok(
    code.includes("rm -rf /opt/server-os/backend-dist"),
    "expected fresh backend-dist on every run (idempotent deploy)",
  );
  // Ownership must be artifact-scoped: a broad chown/chmod of /opt/server-os
  // locks the user out of their own checkout (REPO_DIR may equal it).
  const lines = code.split("\n").map((line) => line.trim());
  assert.ok(
    !lines.includes('chown -R "root:$SERVICE_USER" /opt/server-os'),
    "deploy ownership must be artifact-scoped, never whole /opt/server-os",
  );
  assert.ok(
    !lines.includes("chmod -R 0750 /opt/server-os"),
    "deploy permissions must be artifact-scoped, never whole /opt/server-os",
  );
  assert.ok(
    code.includes('chmod 0755 "$REPO_DIR"'),
    "expected checkout kept traversable for non-root preflight/git",
  );
  // Deploy artifacts live inside the checkout dir on the Dell layout and
  // must not dirty git status (§17 repo-clean check).
  const gitignore = readFileSync(join(here, "..", "..", ".gitignore"), "utf8");
  assert.ok(gitignore.includes("backend-dist"), "expected backend-dist ignored");
  assert.ok(gitignore.includes("backend-package.json"), "expected backend-package.json ignored");
});

test("bootstrap never touches disks, NFS, Immich or app containers", () => {
  const forbidden = [
    "mkfs",
    "wipefs",
    "parted",
    "sgdisk",
    "sfdisk",
    "fdisk",
    "mkswap",
    "cryptsetup",
    "shred",
    "/dev/sdb",
    "/dev/sd",
    "immich",
    "nfs",
    "/etc/fstab",
    "/etc/exports",
  ];
  const hits = forbidden.filter((word) => codeLower.includes(word));
  assert.deepEqual(hits, []);
  assert.ok(!/\bdocker\s+(run|compose\s+up|pull|exec)\b/.test(code), "no app containers deployed");
  assert.ok(!/(^|\s)(mount|umount)(\s|$)/m.test(code), "no mount calls");
});
