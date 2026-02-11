const fs = require("fs");

function requireExists(p, label) {
  if (!fs.existsSync(p)) {
    console.error(`[FATAL] Missing ${label}: ${p}`);
    process.exit(2);
  }
}

requireExists("triage_runner.js", "runner");
requireExists("triage_manifest.json", "manifest");
requireExists("engine/run_smoke_desktop.js", "desktop smoke runner");
requireExists("engine/run_smoke_mobile.js", "mobile smoke runner");

const pkgPath = "package.json";
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

if (!pkg.scripts || typeof pkg.scripts !== "object" || Array.isArray(pkg.scripts)) pkg.scripts = {};
pkg.version = "5.7.6";

// Smoke scripts enforce env + append ENV into journal
pkg.scripts["smoke:desktop"] = "node engine/run_smoke_desktop.js manifests/smoke_desktop.json";
pkg.scripts["smoke:mobile"]  = "node engine/run_smoke_mobile.js manifests/smoke_mobile.json";
pkg.scripts["smoke:dual"]    = "npm run smoke:desktop && npm run smoke:mobile";

// Canonical matter (triage)
pkg.scripts["matter"] = "node triage_runner.js triage_manifest.json";
pkg.scripts["matter:triage"] = "node triage_runner.js triage_manifest.json";

// Remove tier theater
delete pkg.scripts["matter:sku-a"];
delete pkg.scripts["matter:sku-b"];

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

console.log("[OK] package.json locked");
console.log("[OK] smoke:desktop ->", pkg.scripts["smoke:desktop"]);
console.log("[OK] smoke:mobile  ->", pkg.scripts["smoke:mobile"]);
console.log("[OK] smoke:dual    ->", pkg.scripts["smoke:dual"]);
console.log("[OK] matter        ->", pkg.scripts["matter"]);