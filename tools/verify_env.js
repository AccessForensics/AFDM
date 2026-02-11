const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");

function fatal(msg, code) {
  console.error(msg);
  process.exit(code);
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

function newestTwoJournals() {
  const artifactsDir = path.join(repoRoot, "artifacts");
  if (!fs.existsSync(artifactsDir)) fatal("[FATAL] artifacts/ not found", 2);

  const dirs = fs.readdirSync(artifactsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  const journals = [];
  for (const d of dirs) {
    const j = path.join(artifactsDir, d, "journal.ndjson");
    if (!fs.existsSync(j)) continue;
    const stat = fs.statSync(j);
    journals.push({ p: j, m: stat.mtimeMs });
  }

  journals.sort((a,b) => b.m - a.m);
  return journals.slice(0, 2).map(x => x.p);
}

function readEnvRecord(journalPath) {
  const txt = fs.readFileSync(journalPath, "utf8");
  const lines = txt.split(/\r?\n/).filter(Boolean);

  // Find first ENV line
  for (const line of lines) {
    if (!line.includes('"t":"ENV"')) continue;
    try {
      const obj = JSON.parse(line);
      if (obj && obj.t === "ENV") return obj;
    } catch {
      // ignore bad json lines
    }
  }
  return null;
}

function requireFields(env, journalPath) {
  const required = ["env_label","viewport","isMobile","hasTouch","deviceScaleFactor","userAgent","version","git_sha"];
  for (const k of required) {
    if (!(k in env)) fatal("[FATAL] ENV missing field " + k + " in " + journalPath, 5);
  }
}

const expectedVer = pkgVersion();
const expectedSha = gitHeadSha();

const newest = newestTwoJournals();
if (newest.length < 2) fatal("[FATAL] Need at least 2 journals (desktop+mobile) in artifacts/", 3);
if (newest[0] === newest[1]) fatal("[FATAL] Journals must be distinct", 4);

const envA = readEnvRecord(newest[0]);
const envB = readEnvRecord(newest[1]);
if (!envA) fatal("[FATAL] Missing ENV record in " + newest[0], 4);
if (!envB) fatal("[FATAL] Missing ENV record in " + newest[1], 4);

requireFields(envA, newest[0]);
requireFields(envB, newest[1]);

const labels = new Set([envA.env_label, envB.env_label]);
if (!labels.has("DESKTOP")) fatal("[FATAL] Expected DESKTOP env_label in newest two journals", 6);
if (!labels.has("MOBILE_EMULATION")) fatal("[FATAL] Expected MOBILE_EMULATION env_label in newest two journals", 6);

if (expectedVer && (envA.version !== expectedVer || envB.version !== expectedVer)) {
  fatal("[FATAL] ENV version mismatch. expected=" + expectedVer, 7);
}

if (expectedSha && (envA.git_sha !== expectedSha || envB.git_sha !== expectedSha)) {
  fatal("[FATAL] ENV git_sha mismatch. expected=" + expectedSha, 8);
}

console.log("[OK] verify:env passed");
console.log("[OK] desktop+mobile journals:");
console.log(" -", newest[0]);
console.log(" -", newest[1]);
process.exit(0);
