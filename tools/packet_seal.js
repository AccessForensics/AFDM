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

function relPosix(baseDir, filePath) {
  const rel = path.relative(baseDir, filePath);
  return rel.split(path.sep).join("/");
}

function walkFiles(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name));
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkFiles(full));
    else if (e.isFile()) out.push(full);
  }
  return out;
}

function safeWriteAtomic(targetPath, bytes) {
  const tmp = targetPath + ".tmp";
  fs.writeFileSync(tmp, bytes);
  try { const fd = fs.openSync(tmp, "r"); fs.fsyncSync(fd); fs.closeSync(fd); } catch {}
  fs.renameSync(tmp, targetPath);
}

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
    fatal("[FATAL] chromium revision unknown (cannot read browsers.json under playwright-core or playwright)", 24);
  }

  return `node=${node};playwright=${playwright};chromium_rev=${cr.rev}`;
}

function readFirstEnv(journalPath) {
  if (!fs.existsSync(journalPath)) return null;
  const txt = fs.readFileSync(journalPath, "utf8");
  for (const line of txt.split(/\r?\n/)) {
    if (!line) continue;
    if (!line.includes('"t":"ENV"')) continue;
    try { const obj = JSON.parse(line); if (obj && obj.t === "ENV") return obj; } catch {}
  }
  return null;
}

function main() {
  const artifactDirArg = process.argv[2];
  if (!artifactDirArg) fatal("[FATAL] Usage: node tools/packet_seal.js <artifact_dir>", 2);

  const repoRoot = path.resolve(__dirname, "..");
  const artifactDir = path.isAbsolute(artifactDirArg) ? artifactDirArg : path.resolve(repoRoot, artifactDirArg);

  if (!fs.existsSync(artifactDir)) fatal("[FATAL] artifact_dir not found: " + artifactDir, 3);
  if (!fs.statSync(artifactDir).isDirectory()) fatal("[FATAL] artifact_dir is not a directory: " + artifactDir, 3);

  const sealOut = path.join(artifactDir, "packet_hash.txt");
  if (fs.existsSync(sealOut)) fatal("[FATAL] packet_hash.txt already exists (write-once): " + artifactDir, 4);

  const exclude = new Set(["index.json", "packet_hash.txt"]);
  const filesAbs = walkFiles(artifactDir).filter(p => !exclude.has(path.basename(p)) && !p.endsWith(".tmp"));

  const entries = [];
  for (const p of filesAbs) entries.push([relPosix(artifactDir, p), sha256File(p)]);
  entries.sort((a,b)=>a[0].localeCompare(b[0]));

  const indexObj = {};
  for (const [k,v] of entries) indexObj[k] = v;

  const canonicalIndex = toCanonicalJSON(indexObj);
  const packetHash = sha256Bytes(Buffer.from(canonicalIndex, "utf8"));

  const env = readFirstEnv(path.join(artifactDir, "journal.ndjson"));
  const manifest = {
    schema: "AF_PACKET_MANIFEST_V1",
    toolchain_id: toolchainId(repoRoot),
    artifact_dir_hint: path.basename(artifactDir),
    env: env ? {
      env_label: env.env_label,
      viewport: env.viewport,
      isMobile: env.isMobile,
      hasTouch: env.hasTouch,
      deviceScaleFactor: env.deviceScaleFactor,
      userAgent: env.userAgent,
      version: env.version,
      git_sha: env.git_sha,
      ts: env.ts
    } : null
  };

  safeWriteAtomic(path.join(artifactDir, "index.json"), Buffer.from(canonicalIndex + "\n", "utf8"));
  safeWriteAtomic(path.join(artifactDir, "manifest.json"), Buffer.from(JSON.stringify(manifest, null, 2) + "\n", "utf8"));
  safeWriteAtomic(path.join(artifactDir, "packet_hash.txt"), Buffer.from(packetHash + "\n", "utf8"));

  console.log("[OK] packet sealed ->", artifactDir);
  console.log("[OK] wrote index.json, manifest.json, packet_hash.txt");
  console.log("[OK] packet_hash =", packetHash);
  process.exit(0);
}

main();
