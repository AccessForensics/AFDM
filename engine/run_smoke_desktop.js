// Desktop Smoke Runner (forensic grade)
// Forces desktop envelope, runs engine/run_smoke.js, parses AF_ARTIFACT_DIR,
// appends ENV into that exact journal.ndjson.

const fs = require("fs");
const { spawnSync } = require("child_process");
const path = require("path");

function fatal(msg, code) { console.error(msg); process.exit(code); }
const repoRoot = path.resolve(__dirname, "..");
function resolveFromRoot(p) { return path.isAbsolute(p) ? p : path.join(repoRoot, p); }
function extractArtifactDir(stdout) {
  const m = stdout.match(/^\[AF_ARTIFACT_DIR\]\s*(.+)\s*$/m);
  return m ? m[1].trim() : null;
}

const inputArg = process.argv[2];
if (!inputArg) fatal("[FATAL] Usage: node engine/run_smoke_desktop.js <manifest.json>", 2);

const inputManifestPath = resolveFromRoot(inputArg);
if (!fs.existsSync(inputManifestPath)) fatal("[FATAL] Manifest not found: " + inputManifestPath, 3);

const manifest = JSON.parse(fs.readFileSync(inputManifestPath, "utf8"));
manifest.viewport = manifest.viewport || { width: 1366, height: 768 };
manifest.isMobile = false;
manifest.hasTouch = false;
manifest.deviceScaleFactor = manifest.deviceScaleFactor || 1;
manifest.env_label = manifest.env_label || "DESKTOP";
manifest.userAgent = manifest.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const tmpManifestPath = path.join(repoRoot, "manifests", "_tmp_desktop_envelope.json");
fs.writeFileSync(tmpManifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

const nodeExe = process.execPath;
const smokeRunnerPath = path.join(__dirname, "run_smoke.js");

const result = spawnSync(nodeExe, [smokeRunnerPath, tmpManifestPath], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"]
});
if (result.stdout) process.stdout.write(result.stdout);

const exitCode = (result.status === null || result.status === undefined) ? 1 : result.status;
if (exitCode !== 0) process.exit(exitCode);

const artifactDir = extractArtifactDir(result.stdout || "");
if (!artifactDir) fatal("[FATAL] Missing [AF_ARTIFACT_DIR] output from run_smoke.js", 5);

const journal = path.join(artifactDir, "journal.ndjson");
if (!fs.existsSync(journal)) fatal("[FATAL] Journal not found: " + journal, 6);

const envRecord = {
  t: "ENV",
  ts: new Date().toISOString(),
  env_label: manifest.env_label,
  viewport: manifest.viewport,
  isMobile: manifest.isMobile,
  hasTouch: manifest.hasTouch,
  deviceScaleFactor: manifest.deviceScaleFactor,
  userAgent: manifest.userAgent
};

fs.appendFileSync(journal, JSON.stringify(envRecord) + "\n", "utf8");
console.log("[OK] ENV appended ->", journal);
process.exit(0);