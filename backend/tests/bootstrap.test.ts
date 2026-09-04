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

test("bootstrap targets ONLY Ubuntu Server 24.04 x86_64 (Scenario A)", () => {
  for (const needle of ['ID', 'VERSION_ID', '24.04', 'x86_64']) {
    assert.ok(bootstrap.includes(needle), `expected ${needle} gate in bootstrap`);
  }
  assert.ok(/uname\s+-m/.test(bootstrap), "expected uname -m arch gate");
  assert.ok(/Refusing/.test(bootstrap), "expected hard refusal on wrong platform");
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
  for (const unit of [apiUnit, helperUnit]) {
    assert.ok(unit.includes("WantedBy=multi-user.target"), "expected boot enablement");
    assert.ok(unit.includes("Restart=always"), "expected restart policy");
  }
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
