"use strict";

const fs   = require("fs");
const path = require("path");
const cp   = require("child_process");

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function readText(p) {
  return fs.readFileSync(p, "utf8");
}

function fail(msg) {
  console.error("[FAIL] " + msg);
  process.exit(1);
}

function main() {
  const repo = process.cwd();

  // A) src enums file must be exact allowlisted one-liner
  const ALLOWLISTED_ENUMS = "module.exports = require('../../../engine/intake/enums.js');\n";
  const srcEnums = path.join(repo, "src", "engine", "intake", "enums.js");
  if (!fs.existsSync(srcEnums)) fail("Missing " + srcEnums);
  const srcBody = readText(srcEnums).replace(/^\uFEFF/, "");
  if (srcBody !== ALLOWLISTED_ENUMS)
    fail("src/engine/intake/enums.js must exactly match allowlisted one-liner.\nGot: " + JSON.stringify(srcBody));

  // B) No viewport literals or DPR tokens outside allowlist (context-aware)
  const bannedPatterns = [
    /deviceScaleFactor\s*[:=]\s*\d+/i,
    /viewport\s*:\s*\{/i,
    /["'](width|height)["']\s*:\s*(390|393|844|852|1280|1366|720|900)\b/i
  ];

  const allowlistPaths = new Set([
    path.join(repo, "engine", "intake", "enums.js"),
    path.join(repo, "src",    "engine", "intake", "locked.js"),
    path.join(repo, "src",    "engine", "intake", "contextfactory.js"),
    path.join(repo, "tools",  "manifest-generator.js"),
    path.join(repo, "manifests", "smoke_desktop.json"),
    path.join(repo, "manifests", "smoke_mobile.json")
  ]);

  const files = walk(repo)
  .filter(p => !p.includes(path.join(repo, ".git")))
  .filter(p => !p.includes(path.join(repo, "archive")))
  .filter(p => /\.(js|json|md|txt|yml|yaml)$/i.test(p));

for (const p of files) {
    if (allowlistPaths.has(p)) continue;
    const body = readText(p);
    for (const rx of bannedPatterns) {
      if (rx.test(body))
        fail("BANNED_PATTERN in " + path.relative(repo, p) + " pattern=" + String(rx));
    }
  }

  // C) Manifests must match generator output exactly
  cp.execFileSync(process.execPath, [path.join("tools", "manifest-generator.js")], { stdio: "inherit" });
  const status = cp.execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim();
  if (status) fail("Manifest drift detected after generator run.\n" + status);

  // D) Single determination writer: only orchestrator may write DETERMINATION.txt or external results
  const writers = [];
  for (const p of files.filter(p => p.endsWith(".js"))) {
    const rel  = path.relative(repo, p).replace(/\\/g, "/");
    const body = readText(p);
    const writesDetermination =
      /writeFileSync\s*\([^)]*DETERMINATION\.txt/.test(body) ||
      /writeFile\s*\([^)]*DETERMINATION\.txt/.test(body)     ||
      /writeFileSync\s*\([^)]*intakeresult-external/.test(body) ||
      /writeFile\s*\([^)]*intakeresult-external/.test(body);
    if (writesDetermination) writers.push(rel);
  }

  const ALLOWED_WRITER = "src/engine/intake/orchestrator.js";
  if (writers.length === 0)
    fail("No determination writer found. Expected " + ALLOWED_WRITER + " to write determination output.");
  const offenders = writers.filter(w => w !== ALLOWED_WRITER);
  if (offenders.length > 0)
    fail("Single determination emitter rule violated. Offenders: " + JSON.stringify(offenders));

  console.log("[OK] guardrails passed");
}

if (require.main === module) main();