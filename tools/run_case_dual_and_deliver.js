"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function fatal(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: false, ...opts });
  if (!r || typeof r.status !== "number" || r.status !== 0) {
    fatal("[FATAL] Command failed: " + cmd + " " + args.join(" "), (r && r.status) ? r.status : 1);
  }
}

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function repoRoot() {
  return process.cwd();
}

function newestDir(dir) {
  if (!fs.existsSync(dir)) return null;
  const items = fs.readdirSync(dir).map(n => path.join(dir, n))
    .filter(p => fs.existsSync(p) && fs.statSync(p).isDirectory())
    .map(p => ({ p, t: fs.statSync(p).mtimeMs }))
    .sort((a,b) => b.t - a.t);
  return items.length ? items[0].p : null;
}

function failClosedIfLeak(deliverDir) {
  const leakPatterns = [
    /\\intake\\/i,
    /complaint/i,
    /lawsuit/i,
    /summons/i,
    /petition/i,
    /filing/i
  ];

  const allFiles = [];
  (function walk(d) {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else allFiles.push(p);
    }
  })(deliverDir);

  const leaks = allFiles.filter(p => leakPatterns.some(rx => rx.test(p)));
  if (leaks.length) {
    console.error("[FAIL-CLOSED] Intake or lawsuit material detected in Deliverable_Packet. Refusing to build.");
    leaks.slice(0, 50).forEach(p => console.error("LEAK:", p));
    process.exit(90);
  }
}

function main() {
  const root = repoRoot();

  // Use triage_manifest.json as the authoritative URL source
  const triagePath = path.join(root, "triage_manifest.json");
  if (!fs.existsSync(triagePath)) fatal("[FATAL] triage_manifest.json not found at repo root.", 2);

  const tri = readJSON(triagePath);
  if (!tri.url) fatal("[FATAL] triage_manifest.json missing url.", 3);

  // Create temp manifests for desktop/mobile using triage URL
  const tmpDesktop = path.join(root, "manifests", "_tmp_case_desktop.json");
  const tmpMobile  = path.join(root, "manifests", "_tmp_case_mobile.json");

  const baseDesktop = path.join(root, "manifests", "smoke_desktop.json");
  const baseMobile  = path.join(root, "manifests", "smoke_mobile.json");
  if (!fs.existsSync(baseDesktop) || !fs.existsSync(baseMobile)) {
    fatal("[FATAL] Base manifests missing (manifests/smoke_desktop.json or manifests/smoke_mobile.json).", 4);
  }

  const d = readJSON(baseDesktop);
  const m = readJSON(baseMobile);

  d.matter_id = tri.matter_id || "matter";
  d.strict_mode = true;
  d.url = tri.url;

  m.matter_id = tri.matter_id || "matter";
  m.strict_mode = true;
  m.url = tri.url;

  fs.writeFileSync(tmpDesktop, JSON.stringify(d, null, 2));
  fs.writeFileSync(tmpMobile, JSON.stringify(m, null, 2));

  // Run dual capture
  run(process.execPath, [path.join(root, "engine", "run_smoke_desktop.js"), tmpDesktop]);
  run(process.execPath, [path.join(root, "engine", "run_smoke_mobile.js"), tmpMobile]);

  // Locate newest artifacts from these runs
  const artDir = path.join(root, "artifacts");
  const newest = newestDir(artDir);
  if (!newest) fatal("[FATAL] No artifacts folder found after capture.", 10);

  // Build deliverable into newest runs/matter_* folder if one exists, else create one
  const runsDir = path.join(root, "runs");
  if (!fs.existsSync(runsDir)) fs.mkdirSync(runsDir, { recursive: true });

  // Prefer newest matter_ run folder if present, else create a new one
  let caseRoot = null;
  if (fs.existsSync(runsDir)) {
    const candidates = fs.readdirSync(runsDir)
      .map(n => path.join(runsDir, n))
      .filter(p => fs.existsSync(p) && fs.statSync(p).isDirectory() && path.basename(p).startsWith("matter_"))
      .map(p => ({ p, t: fs.statSync(p).mtimeMs }))
      .sort((a,b) => b.t - a.t);
    caseRoot = candidates.length ? candidates[0].p : null;
  }
  if (!caseRoot) {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
    caseRoot = path.join(runsDir, "matter_" + stamp + "_autodeliver");
    fs.mkdirSync(caseRoot, { recursive: true });
  }

  // Ensure Deliverable_Packet exists
  const deliverDir = path.join(caseRoot, "Deliverable_Packet");
  fs.mkdirSync(deliverDir, { recursive: true });

  // Copy core artifacts from BOTH newest desktop+mobile smoke runs
  // We copy the most recent two smoke_* dirs, which should be desktop then mobile.
  const smokeDirs = fs.readdirSync(artDir)
    .map(n => path.join(artDir, n))
    .filter(p => fs.statSync(p).isDirectory() && path.basename(p).startsWith("smoke_"))
    .map(p => ({ p, t: fs.statSync(p).mtimeMs }))
    .sort((a,b) => b.t - a.t)
    .slice(0, 2)
    .map(o => o.p);

  if (smokeDirs.length < 2) {
    fatal("[FATAL] Expected at least 2 smoke_ artifact dirs (desktop+mobile). Found " + smokeDirs.length, 20);
  }

  const packetsDir = path.join(deliverDir, "packets");
  fs.mkdirSync(path.join(packetsDir, "desktop"), { recursive: true });
  fs.mkdirSync(path.join(packetsDir, "mobile"), { recursive: true });

  function copyAll(srcDir, dstDir) {
    for (const name of fs.readdirSync(srcDir)) {
      const sp = path.join(srcDir, name);
      const dp = path.join(dstDir, name);
      const st = fs.statSync(sp);
      if (st.isDirectory()) continue;
      fs.copyFileSync(sp, dp);
    }
  }

  // Heuristic: older of the 2 is desktop (ran first), newest is mobile (ran second)
  const mobileSrc = smokeDirs[0];
  const desktopSrc = smokeDirs[1];

  copyAll(desktopSrc, path.join(packetsDir, "desktop"));
  copyAll(mobileSrc, path.join(packetsDir, "mobile"));

  // Also place a top-level manifest if not present
  const topManifest = path.join(deliverDir, "manifest.json");
  if (!fs.existsSync(topManifest)) {
    fs.writeFileSync(topManifest, JSON.stringify({ matter_id: tri.matter_id || "matter", url: tri.url }, null, 2));
  }

  // FAIL CLOSED if any intake or lawsuit-like files exist in deliverable
  failClosedIfLeak(deliverDir);

  // Zip deliverable
  const zipOut = path.join(caseRoot, "Deliverable_Packet_MANUAL_STAMP.zip");
  // Use PowerShell Compress-Archive from Node via child process
  run("powershell.exe", [
    "-NoProfile",
    "-Command",
    "Compress-Archive -Path (Join-Path '" + deliverDir.replace(/'/g,"''") + "' '*') -DestinationPath '" + zipOut.replace(/'/g,"''") + "' -Force"
  ]);

  console.log("[OK] deliverable_zip -> " + zipOut);
}

main();
