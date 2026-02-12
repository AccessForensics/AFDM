const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function fatal(msg, code) { console.error(msg); process.exit(code); }

function sha256Bytes(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }
function sha256File(p) { return sha256Bytes(fs.readFileSync(p)); }

function canonicalize(v) {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map(canonicalize);
  if (typeof v !== "object") return v;
  const out = {};
  for (const k of Object.keys(v).sort((a,b)=>a.localeCompare(b))) out[k] = canonicalize(v[k]);
  return out;
}
function toCanonicalJSON(obj) { return JSON.stringify(canonicalize(obj)); }

function readChromiumRevision(repoRoot) {
  const candidates = [
    path.join(repoRoot, "node_modules", "playwright-core", "browsers.json"),
    path.join(repoRoot, "node_modules", "playwright", "browsers.json")
  ];

  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const b = JSON.parse(fs.readFileSync(p, "utf8"));
      if (b && Array.isArray(b.browsers)) {
        const c = b.browsers.find(x => x && x.name === "chromium");
        if (c && c.revision) return { rev: String(c.revision), source: p };
      }
    } catch {}
  }
  return { rev: "unknown", source: null };
}

function toolchainId(repoRoot) {
  const node = (process.versions && process.versions.node) ? process.versions.node : "unknown";

  let playwright = "unknown";
  try {
    const p = JSON.parse(fs.readFileSync(path.join(repoRoot, "node_modules", "playwright", "package.json"), "utf8"));
    if (p && p.version) playwright = String(p.version);
  } catch {}
  if (playwright === "unknown") {
    try {
      const p = JSON.parse(fs.readFileSync(path.join(repoRoot, "node_modules", "playwright-core", "package.json"), "utf8"));
      if (p && p.version) playwright = "core@" + String(p.version);
    } catch {}
  }

  const cr = readChromiumRevision(repoRoot);
  if (cr.rev === "unknown") {
    console.error("[FATAL] chromium revision unknown (cannot read browsers.json under playwright-core or playwright)");
    process.exit(24);
  }

  return `node=${node};playwright=${playwright};chromium_rev=${cr.rev}`;
}

function readJournal(journalPath) {
  const txt = fs.readFileSync(journalPath, "utf8");
  return txt.split(/\r?\n/).filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

function requireFields(env, journalPath) {
  const req = ["env_label","viewport","isMobile","hasTouch","deviceScaleFactor","userAgent","version","git_sha","ts"];
  for (const k of req) {
    if (!(k in env)) fatal("[FATAL] ENV missing " + k + " in " + journalPath, 8);
  }
}

function verifyPacketSeal(artifactDir) {
  const idxPath  = path.join(artifactDir, "index.json");
  const manPath  = path.join(artifactDir, "manifest.json");
  const hashPath = path.join(artifactDir, "packet_hash.txt");

  if (!fs.existsSync(hashPath)) fatal("[FATAL] CRASHED_RUN missing packet_hash.txt in " + artifactDir, 9);
  if (!fs.existsSync(idxPath))  fatal("[FATAL] Missing index.json in " + artifactDir, 9);
  if (!fs.existsSync(manPath))  fatal("[FATAL] Missing manifest.json in " + artifactDir, 9);

  const got = (fs.readFileSync(hashPath, "utf8") || "").trim();
  if (!/^[0-9a-f]{64}$/.test(got)) fatal("[FATAL] packet_hash.txt invalid in " + artifactDir, 10);

  let idx;
  try { idx = JSON.parse(fs.readFileSync(idxPath, "utf8")); }
  catch { fatal("[FATAL] index.json not valid JSON in " + artifactDir, 10); }

  if (!idx || Array.isArray(idx) || typeof idx !== "object") fatal("[FATAL] index.json must be a flat object map in " + artifactDir, 10);

  for (const k of Object.keys(idx)) {
    const v = idx[k];
    if (typeof v !== "string" || !/^[0-9a-f]{64}$/.test(v)) fatal("[FATAL] index.json value must be sha256 hex for key=" + k + " in " + artifactDir, 10);
    const fp = path.join(artifactDir, k.split("/").join(path.sep));
    if (!fs.existsSync(fp)) fatal("[FATAL] INTACT failed, missing file: " + k + " in " + artifactDir, 11);
    const actual = sha256File(fp);
    if (actual !== v) fatal("[FATAL] CORRUPTED_ARTIFACT sha mismatch for: " + k + " in " + artifactDir, 12);
  }

  const canonicalIndex = toCanonicalJSON(idx);
  const expected = sha256Bytes(Buffer.from(canonicalIndex, "utf8"));
  if (expected !== got) fatal("[FATAL] TAMPERED_SEAL hash mismatch in " + artifactDir, 13);

  let man;
  try { man = JSON.parse(fs.readFileSync(manPath, "utf8")); }
  catch { fatal("[FATAL] manifest.json not valid JSON in " + artifactDir, 10); }

  const repoRoot = path.resolve(__dirname, "..");
  const actualTc = toolchainId(repoRoot);
  const sealedTc = (man && man.toolchain_id) ? String(man.toolchain_id) : null;

  if (!sealedTc) { console.error("[FATAL] Missing toolchain_id in manifest.json for " + artifactDir); process.exit(24); }
  if (sealedTc !== actualTc) {
    console.error("[FATAL] toolchain_id mismatch");
    console.error("  sealed =", sealedTc);
    console.error("  actual =", actualTc);
    process.exit(24);
  }
}

function main() {
  const repoRoot = path.resolve(__dirname, "..");
  const artifactsDir = path.join(repoRoot, "artifacts");
  if (!fs.existsSync(artifactsDir)) fatal("[FATAL] artifacts dir missing", 7);

  const dirs = fs.readdirSync(artifactsDir)
    .filter(n => n.startsWith("smoke_"))
    .map(n => ({ n, p: path.join(artifactsDir, n), t: fs.statSync(path.join(artifactsDir, n)).mtimeMs }))
    .sort((a,b)=>b.t-a.t)
    .slice(0, 2);

  if (dirs.length < 2) fatal("[FATAL] not enough smoke dirs to verify", 7);

  const journals = [];
  for (const d of dirs) {
    const journalPath = path.join(d.p, "journal.ndjson");
    if (!fs.existsSync(journalPath)) fatal("[FATAL] journal.ndjson missing in " + d.p, 7);

    const records = readJournal(journalPath);
    const env = records.find(r => r.t === "ENV");
    if (!env) fatal("[FATAL] ENV record missing in " + journalPath, 8);
    requireFields(env, journalPath);

    verifyPacketSeal(d.p);
    journals.push(journalPath);
  }

  console.log("[OK] verify:env passed (ENV + SEAL + INTACT + TOOLCHAIN)");
  console.log("[OK] newest two journals:");
  for (const j of journals) console.log(" - " + j);
}

main();
