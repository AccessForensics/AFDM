"use strict";

const fs = require("fs");
const path = require("path");

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exit(1);
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
}

function assertExactSrcEnumsReExport(repoRoot) {
  const target = path.join(repoRoot, "src", "engine", "intake", "enums.js");
  const body = readText(target).replace(/\r\n/g, "\n").trim();
  const expected = "module.exports = require('../../../engine/intake/enums.js');";
  if (body !== expected) {
    fail("src/engine/intake/enums.js must remain the exact one-line canonical re-export");
  }
}

function assertCanonicalIntakeEnums(repoRoot) {
  const enums = require(path.join(repoRoot, "engine", "intake", "enums.js"));

  if (Object.values(enums.DETERMINATION_TEMPLATE || {}).length !== 8) {
    fail("canonical intake enums must expose exactly 8 locked determination templates");
  }

  if (Object.values(enums.OUTCOME || {}).length !== 4) {
    fail("canonical intake enums must expose exactly 4 locked outcome labels");
  }

  if (
    !enums.VIEWPORT ||
    enums.VIEWPORT.DESKTOP.width !== 1366 ||
    enums.VIEWPORT.DESKTOP.height !== 900 ||
    enums.VIEWPORT.MOBILE.width !== 393 ||
    enums.VIEWPORT.MOBILE.height !== 852
  ) {
    fail("canonical intake viewport baselines drifted from AF 1-10 locks");
  }
}

function assertContextFactory(repoRoot) {
  const target = path.join(repoRoot, "src", "engine", "intake", "contextfactory.js");
  const body = readText(target);

  if (!body.includes('require("./enums.js")') && !body.includes("require('./enums.js')")) {
    fail("contextfactory.js must source locked viewport values from ./enums.js");
  }

  if (/\b390\b/.test(body) || /\b844\b/.test(body) || /deviceScaleFactor\s*:\s*3/.test(body)) {
    fail("contextfactory.js still contains stale intake baseline literals");
  }
}

function assertTemplatesFile(repoRoot) {
  const target = path.join(repoRoot, "AFintaketemplates1-8.md");
  const body = readText(target);

  const expectedDeterminations = [
    "DETERMINATION: ELIGIBLE FOR DESKTOP AND MOBILE TECHNICAL RECORD BUILD",
    "DETERMINATION: ELIGIBLE FOR DESKTOP TECHNICAL RECORD BUILD",
    "DETERMINATION: ELIGIBLE FOR DESKTOP TECHNICAL RECORD BUILD / MOBILE BASELINE: CONSTRAINED",
    "DETERMINATION: ELIGIBLE FOR MOBILE TECHNICAL RECORD BUILD",
    "DETERMINATION: ELIGIBLE FOR MOBILE TECHNICAL RECORD BUILD / DESKTOP BASELINE: CONSTRAINED",
    "DETERMINATION: NOT ELIGIBLE FOR FORENSIC EXECUTION",
    "DETERMINATION: NOT ELIGIBLE FOR FORENSIC EXECUTION - CONSTRAINTS (BOTMITIGATION)",
    "DETERMINATION: NOT ELIGIBLE FOR FORENSIC EXECUTION - CONSTRAINTS (OTHER)"
  ];

  for (const line of expectedDeterminations) {
    if (!body.includes(line)) {
      fail(`AFintaketemplates1-8.md is missing locked determination line: ${line}`);
    }
  }

  if (!body.includes("Internal implementation rule, not externally emitted:")) {
    fail("AFintaketemplates1-8.md must contain the internal note-rule heading under the file title");
  }

  if (!body.includes("{{MATTER_LEVEL_NOTE}} may appear only in Template 3 or Template 5")) {
    fail("AFintaketemplates1-8.md must contain the locked note gate");
  }

  const nextSteps = /NEXT STEPS|WHAT IS REQUIRED TO REOPEN INTAKE|COUNSEL ACTION OPTION|REASON:/i;
  if (nextSteps.test(body)) {
    fail("AFintaketemplates1-8.md still contains legacy verbose intake sections");
  }
}

function main() {
  const repoRoot = process.cwd();
  assertExactSrcEnumsReExport(repoRoot);
  assertCanonicalIntakeEnums(repoRoot);
  assertContextFactory(repoRoot);
  assertTemplatesFile(repoRoot);
  console.log("[OK] intake guardrails passed");
}

if (require.main === module) {
  main();
}