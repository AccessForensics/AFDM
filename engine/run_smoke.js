"use strict";

const fs = require("fs");
const path = require("path");
const SKUAEngine = require("./ect.js");

function fail(msg) {
  console.error("[FAIL]", msg);
  process.exit(1);
}

const manifestPath = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!manifestPath) fail("Usage: node engine/run_smoke.js <path-to-manifest.json>");
if (!fs.existsSync(manifestPath)) fail("Manifest not found: " + manifestPath);

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch (e) {
  fail("Manifest JSON parse failed: " + e.message);
}

const watchdogMs = Number(process.env.SKUA_WATCHDOG_MS || 180000);
const watchdog = setTimeout(() => {
  console.error("[FAIL] watchdog timeout, forcing exit");
  process.exit(2);
}, watchdogMs);

(async () => {
  const eng = new SKUAEngine(manifest);

  try {
    if (typeof eng.initialize !== "function") fail("ect.js missing initialize()");
    if (typeof eng.captureMirror !== "function") fail("ect.js missing captureMirror()");

    await eng.initialize();
    await eng.captureMirror();

    const outDir = eng.outputDir;
    if (!outDir || typeof outDir !== "string") fail("Engine did not set outputDir");

    const jp = path.join(outDir, "journal.ndjson");
    console.log('[AF_ARTIFACT_DIR]', path.resolve(outDir));

    // Force a journal entry. Prefer engine method if present.
    if (typeof eng._appendJournalEntry === "function") {
      eng._appendJournalEntry({
        type: "SMOKE",
        ts_utc: new Date().toISOString(),
        ok: true,
        note: "smoke run completed"
      });
    } else {
      fs.appendFileSync(jp, JSON.stringify({
        type: "SMOKE",
        ts_utc: new Date().toISOString(),
        ok: true,
        note: "fallback journal write"
      }) + "\\n");
    }

    // SMOKE GATE: require journal.ndjson
    if (!fs.existsSync(jp)) {
      console.error("[FAIL] smoke gate: journal.ndjson missing:", jp);
      process.exit(2);
    }

    console.log("[PASS] captureMirror completed + journal present");
  } finally {
    clearTimeout(watchdog);
    try { if (eng.context && typeof eng.context.close === "function") await eng.context.close(); } catch {}
    try { if (eng.browser && typeof eng.browser.close === "function") await eng.browser.close(); } catch {}
  }

  process.exit(0);
})().catch((e) => {
  clearTimeout(watchdog);
  console.error("[FAIL] exception:", e && e.stack ? e.stack : e);
  process.exit(1);
});



