"use strict";

const fs = require("fs");
const path = require("path");

const manifestValidatorSource = `"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

function die(msg) { console.error(msg); process.exit(1); }

function walkForForbiddenFiles(root, forbiddenNames, maxNodes) {
  let seen = 0;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { continue; }
    for (const ent of entries) {
      seen += 1;
      if (seen > maxNodes) die("[FATAL_GATE_FAILURE] Staging scan exceeded node budget.");
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        const low = ent.name.toLowerCase();
        if (low === "node_modules" || low === ".git") continue;
        stack.push(full);
        continue;
      }
      if (ent.isFile()) {
        for (const bad of forbiddenNames) {
          if (ent.name.toLowerCase() === bad.toLowerCase()) {
            die(\`[FORBIDDEN_ARTIFACT] Forbidden file present: \${bad}\`);
          }
        }
      }
    }
  }
}

function validateManifest(manifestPath) {
  if (!manifestPath) die("[FATAL_GATE_FAILURE] Missing manifestPath arg.");
  if (!fs.existsSync(manifestPath)) die(\`[FATAL_GATE_FAILURE] Manifest not found: \${manifestPath}\`);

  const content = fs.readFileSync(manifestPath, "utf8");

  const forbiddenTokens = [
    "AF_INTAKE_DEBUG_ARTIFACTS",
    "DEBUG_ARTIFACTS=true",
    "purgeStagingExtractedText",
    "credentials.json",
    ".env"
  ];

  const forbiddenFiles = [
    "extracted_text.txt",
    "credentials.json",
    ".env"
  ];

  const leaks = [
    /[A-Za-z]:\\\\Users\\\\/i,
    /\\\\Users\\\\/i,
    /\\/Users\\//i,
    /\\/home\\//i,
    /\\/mnt\\/[a-z]\\/Users\\//i
  ];

  for (const re of leaks) if (re.test(content)) die(\`[LEAK_DETECTED] Environment anchor: \${re}\`);
  for (const tok of forbiddenTokens) if (content.toLowerCase().includes(tok.toLowerCase())) die(\`[FORBIDDEN_ARTIFACT] Remnant/Flag token in manifest: \${tok}\`);

  let uname = "";
  try { uname = os.userInfo().username; } catch (e) {}
  if (uname && uname.length > 2) {
    const safe = uname.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");
    const uRe = new RegExp(\`\\\\b\${safe}\\\\b\`, "i");
    if (uRe.test(content)) die("[LEAK_DETECTED] Local username token leaked.");
  }

  const norm = manifestPath.replace(/\\\\/g, "/");
  let stagingRoot = path.dirname(manifestPath);
  if (norm.toLowerCase().endsWith("/meta/manifest.json")) stagingRoot = path.dirname(path.dirname(manifestPath));
  if (!fs.existsSync(stagingRoot)) die(\`[FATAL_GATE_FAILURE] Staging root not found: \${stagingRoot}\`);

  walkForForbiddenFiles(stagingRoot, forbiddenFiles, 50000);
  console.log("OK: MANIFEST_INTEGRITY_VERIFIED");
}

validateManifest(process.argv[2]);`;

function applyHardlockV47(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Target build wrapper not found: ${filePath}`);
  const src = fs.readFileSync(filePath, "utf8");

  if (src.includes("AF_GATE_INTEGRATION_V4.7")) {
    console.log("SKIP: Hardlock v4.7 already present in wrapper.");
    return;
  }

  const primaryMarker = 'console.log("OK: zip_name:", path.basename(zipAbs));';
  const altPattern = /console\.log\(['"]OK:\s*zip_name:|console\.log\(['"]✓\s*ZIP/i;

  let injectionIdx = src.indexOf(primaryMarker);
  let markerLength = primaryMarker.length;

  if (injectionIdx === -1) {
    const altMatch = src.match(altPattern);
    if (!altMatch) throw new Error("CRITICAL: Gate injection failed. Wrapper structure incompatible.");
    injectionIdx = altMatch.index;
    markerLength = altMatch[0].length;
  }

  const injectionBlock = `
  // AF_GATE_INTEGRATION_V4.7
  (function AF_HARDLOCK_V47_GATE() {
    const __af_fs = require("fs");
    const __af_path = require("path");
    const __af_cp = require("child_process");

    const __af_matter =
      (typeof matterID !== "undefined" ? matterID :
      (typeof matterId !== "undefined" ? matterId :
      (typeof matter_id !== "undefined" ? matter_id :
      (typeof MATTER_ID !== "undefined" ? MATTER_ID : null))));

    const __af_stage =
      (typeof stagingDir !== "undefined" ? stagingDir :
      (typeof stageDir !== "undefined" ? stageDir :
      (typeof outDir !== "undefined" ? outDir :
      (typeof outputDir !== "undefined" ? outputDir : null))));

    const __af_zip =
      (typeof zipAbs !== "undefined" ? zipAbs :
      (typeof zipPath !== "undefined" ? zipPath :
      (typeof zipOut !== "undefined" ? zipOut :
      (typeof zipFile !== "undefined" ? zipFile : null))));

    if (!__af_matter || !__af_stage || !__af_zip) throw new Error("[FATAL_GATE_FAILURE] Scope variables missing, matter, staging, zip.");
    if (!__af_fs.existsSync(__af_stage)) throw new Error("[FATAL_GATE_FAILURE] stagingDir invalid or missing.");
    if (!__af_fs.existsSync(__af_zip)) throw new Error("[FATAL_GATE_FAILURE] zip path invalid or missing.");

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    let manifestPath = __af_path.join(__af_stage, "manifest.json");
    if (!__af_fs.existsSync(manifestPath)) manifestPath = __af_path.join(__af_stage, "meta", "manifest.json");
    if (!__af_fs.existsSync(manifestPath)) throw new Error(\`[FATAL_GATE_FAILURE] Manifest not found in \${__af_stage}\`);

    const validator = __af_path.join(__dirname, "manifest_validator.js");

    try {
      console.log(\`[PROCEDURAL_GATE] Initiating manifest audit: \${__af_matter}\`);
      __af_cp.execSync(\`node "\${validator}" "\${manifestPath}"\`, { stdio: "inherit" });
      console.log(\`[PROCEDURAL_GATE] INTEGRITY_VERIFIED: \${ts}\`);
    } catch (error) {
      const contaminatedPath = \`\${__af_zip}.CONTAMINATED_\${ts}.bak\`;
      const logDir = __af_path.join(process.cwd(), "_night_lock");
      const failureLog = __af_path.join(logDir, \`gate_failure_\${ts}.log\`);

      const failureRecord = {
        timestamp: ts,
        matterID: __af_matter,
        error: String(error && error.message ? error.message : error),
        quarantined: contaminatedPath,
        pipeline: "Hardlock v4.7"
      };

      if (!__af_fs.existsSync(logDir)) __af_fs.mkdirSync(logDir, { recursive: true });
      __af_fs.writeFileSync(failureLog, JSON.stringify(failureRecord, null, 2), "utf8");

      console.error(\`[FATAL_GATE_FAILURE] Matter \${__af_matter}: \${failureRecord.error}\`);
      try { if (__af_fs.existsSync(__af_zip)) __af_fs.renameSync(__af_zip, contaminatedPath); } catch (e) {}
      process.exit(1);
    }
  })();
`;

  const splitAt = injectionIdx + markerLength;
  const patchedSrc = src.slice(0, splitAt) + injectionBlock + src.slice(splitAt);

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const logDir = path.join(process.cwd(), "_night_lock");
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const backupPath = path.join(logDir, `build_deliverable_zip_safe.js.BACKUP_${ts}.bak`);
  fs.writeFileSync(backupPath, src, "utf8");

  fs.writeFileSync(filePath, patchedSrc, "utf8");
  console.log("OK: Hardlock v4.7 gate patch applied, idempotent, variable tolerant.");
  console.log(`OK: Backup saved: ${backupPath}`);
}

try {
  console.log("--- STARTING HARDLOCK v4.7 BUNDLE DEPLOYMENT ---");
  const toolsDir = path.join(process.cwd(), "tools");
  if (!fs.existsSync(toolsDir)) fs.mkdirSync(toolsDir, { recursive: true });

  fs.writeFileSync(path.join(toolsDir, "manifest_validator.js"), manifestValidatorSource, "utf8");
  applyHardlockV47(path.join(toolsDir, "build_deliverable_zip_safe.js"));

  console.log("--- DEPLOYMENT SUCCESSFUL ---");
} catch (err) {
  console.error("--- DEPLOYMENT FAILED ---");
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
}
