"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function walkForForbiddenFiles(root, forbiddenNames, maxNodes = 50000) {
  let seen = 0;
  const stack = [root];

  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const ent of entries) {
      seen += 1;
      if (seen > maxNodes) die("[FATAL_GATE_FAILURE] Staging scan exceeded node budget.");

      if (ent.isDirectory()) {
        const low = ent.name.toLowerCase();
        if (low === "node_modules" || low === ".git") continue;
        stack.push(path.join(dir, ent.name));
        continue;
      }

      if (ent.isFile()) {
        for (const bad of forbiddenNames) {
          if (ent.name.toLowerCase() === bad.toLowerCase()) {
            die(`[FORBIDDEN_ARTIFACT] Forbidden file present: ${bad}`);
          }
        }
      }
    }
  }
}

function validateManifest(manifestPath) {
  if (!manifestPath) die("[FATAL_GATE_FAILURE] Missing manifestPath arg.");
  if (!fs.existsSync(manifestPath)) die(`[FATAL_GATE_FAILURE] Manifest not found: ${manifestPath}`);

  const content = fs.readFileSync(manifestPath, "utf8");

  // Token leaks inside manifest text (not filenames)
  const forbiddenTokens = [
    "AF_INTAKE_DEBUG_ARTIFACTS",
    "DEBUG_ARTIFACTS=true",
    "purgeStagingExtractedText",
    "credentials.json",
    ".env"
  ];

  // Forbidden FILES anywhere under staging root at gate time
  const forbiddenFiles = [
    "extracted_text.txt",
    "credentials.json",
    ".env"
  ];

  // Environment anchors, catch BOTH raw and JSON-escaped Windows paths
  const leaks = [
    /[A-Za-z]:\\\\Users\\\\/i,   // JSON escaped: C:\\Users\\
    /\\\\Users\\\\/i,            // JSON escaped: \\Users\\
    /[A-Za-z]:\\Users\\/i,       // Raw-ish: C:\Users\
    /\\Users\\/i,                // Raw-ish: \Users\
    /\/Users\//i,                // macOS: /Users/
    /\/home\//i,                 // Linux: /home/
    /\/mnt\/[a-z]\/Users\//i     // WSL: /mnt/c/Users/
  ];

  for (const re of leaks) {
    if (re.test(content)) die(`[LEAK_DETECTED] Environment anchor: ${re}`);
  }

  for (const tok of forbiddenTokens) {
    if (content.toLowerCase().includes(tok.toLowerCase())) {
      die(`[FORBIDDEN_ARTIFACT] Remnant/Flag token in manifest: ${tok}`);
    }
  }

  // Local username token leak check (best effort)
  let uname = "";
  try { uname = os.userInfo().username; } catch {}

  if (uname && uname.length > 2) {
    const safe = uname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const uRe = new RegExp(`\\b${safe}\\b`, "i");
    if (uRe.test(content)) die("[LEAK_DETECTED] Local username token leaked.");
  }

  // Determine staging root, supports staging\meta\manifest.json
  const norm = manifestPath.replace(/\\/g, "/").toLowerCase();
  let stagingRoot = path.dirname(manifestPath);

  if (norm.endsWith("/meta/manifest.json")) {
    stagingRoot = path.dirname(path.dirname(manifestPath));
  }

  if (!fs.existsSync(stagingRoot)) die(`[FATAL_GATE_FAILURE] Staging root not found: ${stagingRoot}`);

  walkForForbiddenFiles(stagingRoot, forbiddenFiles, 50000);

  console.log("OK: MANIFEST_INTEGRITY_VERIFIED");
}

validateManifest(process.argv[2]);
