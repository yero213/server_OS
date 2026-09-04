import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const buildDir = join(here, "..", "build");

if (!existsSync(join(buildDir, "index.html"))) {
  console.error("frontend smoke: build/index.html missing — run `npm run build` first");
  process.exit(1);
}
const html = readFileSync(join(buildDir, "index.html"), "utf8");
for (const needle of ["Server OS", "/api/v1/health", "Phase 1"]) {
  if (!html.includes(needle)) {
    console.error(`frontend smoke: expected ${JSON.stringify(needle)} in built HTML`);
    process.exit(1);
  }
}
console.log("frontend smoke: OK (static dashboard contains status markers)");
