const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function fatal(msg, code) {
  console.error(msg);
  process.exit(code);
}

const repoRoot = path.resolve(__dirname, "..");

function resolveFromRoot(p) {
  return path.isAbsolute(p) ? p : path.join(repoRoot, p);
}

function gitHeadSha() {
  const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
  if (r.status !== 0) return null;
  return (r.stdout || "").trim() || null;
}

function pkgVersion() {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
    return p.version || null;
  } catch {
    return null;
  }
}

function parseArtifactDir(outputText) {
  const m = outputText.match(/^\[AF_ARTIFACT_DIR\]\s+(.+)\s*$/m);
  return m ? m[1].trim() : null;
}

const inputArg = process.argv[2];
if (!inputArg) fatal("[FATAL] Usage: node engine/run_smoke_desktop.js <manifest.json>", 2);

const inputManifestPath = resolveFromRoot(inputArg);
if (!fs.existsSync(inputManifestPath)) fatal("[FATAL] Manifest not found: " + inputManifestPath, 3);

const manifest = JSON.parse(fs.readFileSync(inputManifestPath, "utf8"));

// Force desktop envelope (deterministic)
manifest.viewport = manifest.viewport || { width: 1366, height: 768 };
manifest.isMobile = false;
manifest.hasTouch = false;
manifest.deviceScaleFactor = manifest.deviceScaleFactor || 1;
manifest.env_label = manifest.env_label || "DESKTOP";
manifest.userAgent =
  manifest.userAgent ||
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const tmpManifestPath = path.join(repoRoot, "manifests", "_tmp_desktop_envelope.json");
fs.writeFileSync(tmpManifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

// Run canonical smoke runner, capture output so we can parse AF_ARTIFACT_DIR deterministically
const nodeExe = process.execPath;
const smokeRunnerPath = path.join(__dirname, "run_smoke.js");

const r = spawnSync(nodeExe, [smokeRunnerPath, tmpManifestPath], {
  cwd: repoRoot,
  encoding: "utf8"
});

const out = (r.stdout || "") + (r.stderr || "");
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);

const exitCode = (r.status === null || r.status === undefined) ? 1 : r.status;
if (exitCode !== 0) process.exit(exitCode);

const artifactDir = parseArtifactDir(out);
if (!artifactDir) fatal("[FATAL] Missing [AF_ARTIFACT_DIR] marker in run_smoke output", 4);

const journalPath = path.join(artifactDir, "journal.ndjson");
if (!fs.existsSync(journalPath)) fatal("[FATAL] journal.ndjson missing at: " + journalPath, 5);

const envRecord = {
  t: "ENV",
  ts: new Date().toISOString(),
  env_label: manifest.env_label,
  viewport: manifest.viewport,
  isMobile: manifest.isMobile,
  hasTouch: manifest.hasTouch,
  deviceScaleFactor: manifest.deviceScaleFactor,
  userAgent: manifest.userAgent,
  version: pkgVersion(),
  git_sha: gitHeadSha()
};

fs.appendFileSync(journalPath, JSON.stringify(envRecord) + "\n", "utf8");
console.log("[OK] ENV appended ->", journalPath);

{
  // AF_SEAL_BEGIN
  const __afSealScript = path.join(repoRoot, "tools", "packet_seal.js");
  const __afSealRes = spawnSync(nodeExe, [__afSealScript, artifactDir], { cwd: repoRoot, encoding: "utf8" });
  if (__afSealRes.stdout) process.stdout.write(__afSealRes.stdout);
  if (__afSealRes.stderr) process.stderr.write(__afSealRes.stderr);
  if (__afSealRes.status !== 0) fatal("[FATAL] packet_seal failed for: " + artifactDir, 9);
  // AF_SEAL_END
}

process.exit(0);
