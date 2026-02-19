"use strict";

const fs = require("fs");
const path = require("path");

function tsSafe() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function readUtf8(p) {
  return fs.readFileSync(p, "utf8");
}

function writeUtf8(p, s) {
  fs.writeFileSync(p, s, { encoding: "utf8" });
}

function applyHardlockV47(wrapperPath) {
  if (!fs.existsSync(wrapperPath)) {
    throw new Error("Target build wrapper not found: " + wrapperPath);
  }

  const original = readUtf8(wrapperPath);

  // Idempotency guard
  if (original.includes("AF_GATE_INTEGRATION_V4.7") || original.includes("AF_HARDLOCK_V47_GATE")) {
    console.log("SKIP: Hardlock v4.7 already present in wrapper.");
    return;
  }

  const primaryMarker = 'console.log("OK: zip_name:", path.basename(zipAbs));';
  let injectionIdx = original.indexOf(primaryMarker);
  let markerLen = primaryMarker.length;

  // Fallback anchor, any console.log line mentioning zip_name or ZIP
  if (injectionIdx === -1) {
    const re = /console\.log\([^\r\n;]*(zip_name|ZIP)[^\r\n;]*\);\s*/i;
    const m = original.match(re);
    if (!m || typeof m.index !== "number") {
      throw new Error("CRITICAL: Gate injection failed. Wrapper structure incompatible (no zip log anchor).");
    }
    injectionIdx = m.index;
    markerLen = m[0].length;
  }

  const injectionBlock = [
    "",
    "  // AF_GATE_INTEGRATION_V4.7",
    "  (function AF_HARDLOCK_V47_GATE() {",
    "    const __af_fs = require(\"fs\");",
    "    const __af_path = require(\"path\");",
    "    const __af_cp = require(\"child_process\");",
    "",
    "    const __af_matter =",
    "      (typeof matterID !== \"undefined\" ? matterID :",
    "      (typeof matterId !== \"undefined\" ? matterId :",
    "      (typeof matter_id !== \"undefined\" ? matter_id :",
    "      (typeof MATTER_ID !== \"undefined\" ? MATTER_ID :",
    "      (typeof manifest !== \"undefined\" && manifest && (manifest.matter_id || manifest.matterID) ? (manifest.matter_id || manifest.matterID) : null)))));",
    "",
    "    const __af_stage =",
    "      (typeof stagingDir !== \"undefined\" ? stagingDir :",
    "      (typeof stageDir !== \"undefined\" ? stageDir :",
    "      (typeof outDir !== \"undefined\" ? outDir :",
    "      (typeof outputDir !== \"undefined\" ? outputDir :",
    "      (typeof stagingAbs !== \"undefined\" ? stagingAbs : null)))));",
    "",
    "    const __af_zip =",
    "      (typeof zipAbs !== \"undefined\" ? zipAbs :",
    "      (typeof zipPath !== \"undefined\" ? zipPath :",
    "      (typeof zipOut !== \"undefined\" ? zipOut :",
    "      (typeof zipFile !== \"undefined\" ? zipFile : null))));",
    "",
    "    if (!__af_matter || !__af_stage || !__af_zip) {",
    "      throw new Error(\"[FATAL_GATE_FAILURE] Scope variables missing, matter, staging, zip.\");",
    "    }",
    "    if (!__af_fs.existsSync(__af_stage)) {",
    "      throw new Error(\"[FATAL_GATE_FAILURE] stagingDir invalid or missing.\");",
    "    }",
    "    if (!__af_fs.existsSync(__af_zip)) {",
    "      throw new Error(\"[FATAL_GATE_FAILURE] zip path invalid or missing.\");",
    "    }",
    "",
    "    const ts = new Date().toISOString().replace(/[:.]/g, \"-\");",
    "    let manifestPath = __af_path.join(__af_stage, \"manifest.json\");",
    "    if (!__af_fs.existsSync(manifestPath)) {",
    "      manifestPath = __af_path.join(__af_stage, \"meta\", \"manifest.json\");",
    "    }",
    "    if (!__af_fs.existsSync(manifestPath)) {",
    "      throw new Error(\"[FATAL_GATE_FAILURE] Manifest not found in \" + __af_stage);",
    "    }",
    "",
    "    const validator = __af_path.join(__dirname, \"manifest_validator.js\");",
    "",
    "    try {",
    "      console.log(\"[PROCEDURAL_GATE] Initiating manifest audit: \" + __af_matter);",
    "      __af_cp.execSync(\"node \\\"\" + validator + \"\\\" \\\"\" + manifestPath + \"\\\"\", { stdio: \"inherit\" });",
    "      console.log(\"[PROCEDURAL_GATE] INTEGRITY_VERIFIED: \" + ts);",
    "    } catch (error) {",
    "      const contaminatedPath = String(__af_zip) + \".CONTAMINATED_\" + ts + \".bak\";",
    "      const logDir = __af_path.join(process.cwd(), \"_night_lock\");",
    "      const failureLog = __af_path.join(logDir, \"gate_failure_\" + ts + \".log\");",
    "",
    "      const failureRecord = {",
    "        timestamp: ts,",
    "        matterID: __af_matter,",
    "        error: String(error && error.message ? error.message : error),",
    "        quarantined: contaminatedPath,",
    "        pipeline: \"Hardlock v4.7\"",
    "      };",
    "",
    "      try {",
    "        if (!__af_fs.existsSync(logDir)) __af_fs.mkdirSync(logDir, { recursive: true });",
    "        __af_fs.writeFileSync(failureLog, JSON.stringify(failureRecord, null, 2), \"utf8\");",
    "      } catch (e) {}",
    "",
    "      console.error(\"[FATAL_GATE_FAILURE] Matter \" + __af_matter + \": \" + failureRecord.error);",
    "      try {",
    "        if (__af_fs.existsSync(__af_zip)) __af_fs.renameSync(__af_zip, contaminatedPath);",
    "      } catch (e) {}",
    "",
    "      process.exit(1);",
    "    }",
    "  })();",
    ""
  ].join("\n");

  const splitAt = injectionIdx + markerLen;
  const patched = original.slice(0, splitAt) + injectionBlock + original.slice(splitAt);

  const stamp = tsSafe();
  const lockDir = path.join(process.cwd(), "_night_lock");
  ensureDir(lockDir);

  const backupPath = path.join(lockDir, "build_deliverable_zip_safe.js.BACKUP_" + stamp + ".bak");
  writeUtf8(backupPath, original);
  writeUtf8(wrapperPath, patched);

  console.log("OK: Hardlock v4.7 gate patch applied, idempotent.");
  console.log("OK: Backup saved: " + backupPath);
}

function main() {
  const repoRoot = process.cwd();
  const toolsDir = path.join(repoRoot, "tools");
  const lockDir = path.join(repoRoot, "_night_lock");
  ensureDir(toolsDir);
  ensureDir(lockDir);

  const validatorPath = path.join(toolsDir, "manifest_validator.js");
  const wrapperPath = path.join(toolsDir, "build_deliverable_zip_safe.js");

  // This is the VALIDATOR that your wrapper gate will execute at runtime.
  const validatorSource = [
    "\"use strict\";",
    "",
    "const fs = require(\"fs\");",
    "const os = require(\"os\");",
    "const path = require(\"path\");",
    "",
    "function die(msg) {",
    "  console.error(msg);",
    "  process.exit(1);",
    "}",
    "",
    "function walkForForbiddenFiles(root, forbiddenNames, maxNodes = 50000) {",
    "  let seen = 0;",
    "  const stack = [root];",
    "",
    "  while (stack.length) {",
    "    const dir = stack.pop();",
    "    let entries;",
    "    try {",
    "      entries = fs.readdirSync(dir, { withFileTypes: true });",
    "    } catch {",
    "      continue;",
    "    }",
    "",
    "    for (const ent of entries) {",
    "      seen += 1;",
    "      if (seen > maxNodes) die(\"[FATAL_GATE_FAILURE] Staging scan exceeded node budget.\");",
    "",
    "      const full = path.join(dir, ent.name);",
    "",
    "      if (ent.isDirectory()) {",
    "        const low = ent.name.toLowerCase();",
    "        if (low === \"node_modules\" || low === \".git\") continue;",
    "        stack.push(full);",
    "        continue;",
    "      }",
    "",
    "      if (ent.isFile()) {",
    "        for (const bad of forbiddenNames) {",
    "          if (ent.name.toLowerCase() === bad.toLowerCase()) {",
    "            die(`[FORBIDDEN_ARTIFACT] Forbidden file present: ${bad}`);",
    "          }",
    "        }",
    "      }",
    "    }",
    "  }",
    "}",
    "",
    "function validateManifest(manifestPath) {",
    "  if (!manifestPath) die(\"[FATAL_GATE_FAILURE] Missing manifestPath arg.\");",
    "  if (!fs.existsSync(manifestPath)) die(`[FATAL_GATE_FAILURE] Manifest not found: ${manifestPath}`);",
    "",
    "  const content = fs.readFileSync(manifestPath, \"utf8\");",
    "",
    "  const forbiddenTokens = [",
    "    \"AF_INTAKE_DEBUG_ARTIFACTS\",",
    "    \"DEBUG_ARTIFACTS=true\",",
    "    \"purgeStagingExtractedText\",",
    "    \"credentials.json\",",
    "    \".env\"",
    "  ];",
    "",
    "  const forbiddenFiles = [",
    "    \"extracted_text.txt\",",
    "    \"credentials.json\",",
    "    \".env\"",
    "  ];",
    "",
    "  const leaks = [",
    "    /[A-Za-z]:\\\\\\\\Users\\\\\\\\/i,     // JSON escaped Windows path: C:\\\\Users\\\\",
    "    /[A-Za-z]:\\\\Users\\\\/i,           // Raw-ish Windows path: C:\\Users\\",
    "    /\\\\\\\\Users\\\\\\\\/i,              // JSON escaped \\\\Users\\\\",
    "    /\\\\Users\\\\/i,                    // Raw-ish \\\\Users\\\\",
    "    /\\/Users\\//i,                     // macOS /Users/",
    "    /\\/home\\//i,                      // Linux /home/",
    "    /\\/mnt\\/[a-z]\\/Users\\//i         // WSL /mnt/c/Users/",
    "  ];",
    "",
    "  for (const re of leaks) {",
    "    if (re.test(content)) die(`[LEAK_DETECTED] Environment anchor: ${re}`);",
    "  }",
    "",
    "  for (const tok of forbiddenTokens) {",
    "    if (content.toLowerCase().includes(tok.toLowerCase())) {",
    "      die(`[FORBIDDEN_ARTIFACT] Remnant/Flag token in manifest: ${tok}`);",
    "    }",
    "  }",
    "",
    "  let uname = \"\";",
    "  try { uname = os.userInfo().username; } catch {}",
    "",
    "  if (uname && uname.length > 2) {",
    "    const safe = uname.replace(/[.*+?^${}()|[\\]\\\\]/g, \"\\\\$&\");",
    "    const uRe = new RegExp(`\\\\b${safe}\\\\b`, \"i\");",
    "    if (uRe.test(content)) die(\"[LEAK_DETECTED] Local username token leaked.\");",
    "  }",
    "",
    "  const norm = manifestPath.replace(/\\\\\\\\/g, \"/\").toLowerCase();",
    "  let stagingRoot = path.dirname(manifestPath);",
    "",
    "  if (norm.endsWith(\"/meta/manifest.json\")) {",
    "    stagingRoot = path.dirname(path.dirname(manifestPath));",
    "  }",
    "",
    "  if (!fs.existsSync(stagingRoot)) die(`[FATAL_GATE_FAILURE] Staging root not found: ${stagingRoot}`);",
    "",
    "  walkForForbiddenFiles(stagingRoot, forbiddenFiles, 50000);",
    "",
    "  console.log(\"OK: MANIFEST_INTEGRITY_VERIFIED\");",
    "}",
    "",
    "validateManifest(process.argv[2]);",
    ""
  ].join("\n");

  console.log("--- STARTING HARDLOCK v4.7 NIGHT LOCK ---");
  writeUtf8(validatorPath, validatorSource);
  console.log("OK: Wrote tools/manifest_validator.js");

  applyHardlockV47(wrapperPath);

  console.log("--- NIGHT LOCK COMPLETE ---");
}

try {
  main();
} catch (e) {
  console.error("--- NIGHT LOCK FAILED ---");
  console.error(e && e.message ? e.message : String(e));
  process.exit(1);
}
