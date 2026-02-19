"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const TEXT_EXT = new Set([
  ".txt", ".json", ".csv", ".md", ".html", ".htm", ".xml", ".log", ".sha256", ".ndjson", ".yml", ".yaml"
]);

// Hard leak patterns (paths)
const PATH_PATTERNS = [
  { name: "win_users_drive", re: /[a-z]:\\users\\[^\s\\]+/ig },
  { name: "win_users_unc",   re: /\\users\\[^\s\\]+/ig },
  { name: "mac_users",       re: /\/users\/[^\/\s]+/ig },
  { name: "linux_home",      re: /\/home\/[^\/\s]+/ig }
];

function readJsonIfExists(fp) {
  try {
    if (!fs.existsSync(fp)) return null;
    const raw = fs.readFileSync(fp, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function walkFiles(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); }
    catch { continue; }

    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile()) out.push(full);
    }
  }
  return out;
}

function rel(root, full) {
  try { return path.relative(root, full); } catch { return full; }
}

function isTextLike(fp) {
  return TEXT_EXT.has(path.extname(fp).toLowerCase());
}

function getRepoRoot() {
  // tools/.. is repo root
  return path.resolve(__dirname, "..");
}

function getLeakTokens() {
  const rawTokens = [];

  // Common environment tokens
  for (const k of ["USERNAME", "USER", "LOGNAME"]) {
    if (process.env[k]) rawTokens.push(String(process.env[k]));
  }

  // Optional manual tokens: comma-separated
  if (process.env.AF_LEAK_TOKENS) {
    String(process.env.AF_LEAK_TOKENS).split(",").forEach(t => rawTokens.push(t));
  }

  // Normalize, de-dupe, ignore tiny tokens (too noisy)
  const cleaned = [];
  const seen = new Set();
  for (const t of rawTokens) {
    const s = String(t || "").trim();
    if (s.length < 3) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(s);
  }
  return cleaned;
}

function tokenRegexes(tokens) {
  return tokens.map(t => ({
    name: `token:${t}`,
    re: new RegExp(escapeRegExp(t), "ig")
  }));
}

function sanitizeRunSummary(runSummaryPath, caseId, tokens) {
  if (!fs.existsSync(runSummaryPath)) return false;

  const raw = fs.readFileSync(runSummaryPath, "utf8");
  let s = raw;

  // Force RunFolder to a relative, non-identifying value
  s = s.replace(/^RunFolder:\s+.*$/gmi, `RunFolder: runs\\${caseId}`);

  // Redact common user path shapes
  s = s.replace(/[a-z]:\\users\\[^\s\\]+/gmi, "C:\\Users\\REDACTED");
  s = s.replace(/\\users\\[^\s\\]+/gmi, "\\Users\\REDACTED");
  s = s.replace(/\/users\/[^\/\s]+/gmi, "/Users/REDACTED");
  s = s.replace(/\/home\/[^\/\s]+/gmi, "/home/REDACTED");

  // Redact optional operator tokens
  for (const t of tokens) {
    const re = new RegExp(escapeRegExp(t), "ig");
    s = s.replace(re, "REDACTED");
  }

  if (s !== raw) {
    fs.writeFileSync(runSummaryPath, s.endsWith("\n") ? s : (s + "\n"), { encoding: "utf8" });
    return true;
  }
  return false;
}

function scanTextFilesForLeaks(deliverableDir, patterns, opts) {
  const maxHits = Number(opts.maxHits ?? 50);
  const maxBytes = Number(opts.maxTextBytes ?? (2 * 1024 * 1024)); // 2 MB per text file

  const files = walkFiles(deliverableDir).filter(isTextLike);
  const hits = [];

  for (const fp of files) {
    let st;
    try { st = fs.statSync(fp); } catch { continue; }
    if (!st || !st.isFile()) continue;

    // Avoid choking on giant "text" files
    if (st.size > maxBytes) continue;

    let text;
    try { text = fs.readFileSync(fp, "utf8"); } catch { continue; }

    for (const p of patterns) {
      const m = text.match(p.re);
      if (m && m.length) {
        hits.push({
          file: rel(deliverableDir, fp),
          pattern: p.name,
          sample: String(m[0]).slice(0, 160)
        });
        if (hits.length >= maxHits) return hits;
      }
    }
  }

  return hits;
}

function scanExifMetadataForLeaks(deliverableDir, patterns, opts) {
  const maxHits = Number(opts.maxHits ?? 50);
  const exifExe = path.join(__dirname, "exiftool", "exiftool.exe");
  if (!fs.existsSync(exifExe)) return [];

  // Use JSON so we can ignore ExifTool-derived path fields (SourceFile, Directory, FileName)
  const args = [
    "-json", "-G1", "-a", "-q", "-q", "-r",
    "-ext", "pdf", "-ext", "png", "-ext", "jpg", "-ext", "jpeg", "-ext", "webp",
    deliverableDir
  ];

  const r = spawnSync(exifExe, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });

  const out = (r.stdout || "");
  if (!out.trim()) return [];

  let arr;
  try { arr = JSON.parse(out); } catch { return []; }
  if (!Array.isArray(arr)) return [];

  const hits = [];
  for (const obj of arr) {
    if (!obj || typeof obj !== "object") continue;

    // Remove fields derived from local filesystem, not embedded metadata
    for (const k of Object.keys(obj)) {
      if (
        k === "SourceFile" ||
        /(^Directory$)|(^FileName$)|(^FilePath$)/i.test(k) ||
        /(:Directory$)|(:FileName$)|(:FilePath$)/i.test(k)
      ) delete obj[k];
    }

    const blob = JSON.stringify(obj);
    for (const p of patterns) {
      const m = blob.match(p.re);
      if (m && m.length) {
        hits.push({
          file: "(exiftool-metadata)",
          pattern: p.name,
          sample: String(m[0]).slice(0, 160)
        });
        if (hits.length >= maxHits) return hits;
      }
    }
  }

  return hits;
}

function sha256File(fp) {
  const h = crypto.createHash("sha256");
  const buf = fs.readFileSync(fp);
  h.update(buf);
  return h.digest("hex");
}

function loadRequirements() {
  const fp = path.join(__dirname, "deliverable_requirements.json");
  const cfg = readJsonIfExists(fp) || {};

  // IMPORTANT: defaults must not brick real small packets
  return {
    min_file_count: Number(cfg.min_file_count ?? 6),
    min_total_bytes: Number(cfg.min_total_bytes ?? 12000),
    required_rel_files: Array.isArray(cfg.required_rel_files)
      ? cfg.required_rel_files
      : ["RUN_SUMMARY.txt"],
    buckets: Array.isArray(cfg.buckets) ? cfg.buckets : []
  };
}

function enforceCompleteness(deliverableDir) {
  if (String(process.env.AF_DISABLE_COMPLETENESS_GATE || "").trim() === "1") return;

  const req = loadRequirements();
  const files = walkFiles(deliverableDir);
  const rels = files.map(f => rel(deliverableDir, f).replace(/\\/g, "/"));

  const fileCount = files.length;
  const totalBytes = files.reduce((sum, fp) => {
    try { return sum + fs.statSync(fp).size; } catch { return sum; }
  }, 0);

  const missing = [];

  for (const rf of req.required_rel_files) {
    const want = String(rf).replace(/\\/g, "/");
    const ok = rels.some(r => r.toLowerCase() === want.toLowerCase());
    if (!ok) missing.push(`missing required file: ${rf}`);
  }

  if (fileCount < req.min_file_count) missing.push(`file_count ${fileCount} < min_file_count ${req.min_file_count}`);
  if (totalBytes < req.min_total_bytes) missing.push(`total_bytes ${totalBytes} < min_total_bytes ${req.min_total_bytes}`);

  // Buckets, at least one match per bucket
  for (const b of req.buckets) {
    const name = b && b.name ? String(b.name) : "bucket";
    const any = Array.isArray(b.any) ? b.any : [];
    if (!any.length) continue;

    const ok = any.some(rx => {
      try {
        const re = new RegExp(rx, "i");
        return rels.some(r => re.test(r));
      } catch {
        return false;
      }
    });

    if (!ok) missing.push(`bucket failed: ${name}`);
  }

  if (missing.length) {
    const err = new Error(
      "[FAIL] Completeness gate failed for Deliverable_Packet:\n" +
      missing.map(s => `- ${s}`).join("\n") +
      "\nOverride (not recommended): set AF_DISABLE_COMPLETENESS_GATE=1\n" +
      "Or tighten/adjust rules in tools/deliverable_requirements.json"
    );
    err.name = "DELIVERABLE_INCOMPLETE";
    throw err;
  }
}

function writeToolingHashes(caseRoot) {
  const deliverableDir = path.join(caseRoot, "Deliverable_Packet");
  const repoRoot = getRepoRoot();

  const lines = [];
  function addHash(label, repoRelPath) {
    const fp = path.join(repoRoot, repoRelPath);
    if (fs.existsSync(fp)) lines.push(`${label}: ${sha256File(fp)}`);
    else lines.push(`${label}: (missing)`);
  }

  lines.push("TOOLING_HASHES");
  lines.push(`node: ${process.version}`);
  addHash("tools/deliverable_guard.js", "tools/deliverable_guard.js");
  addHash("tools/build_deliverable_zip_safe.js", "tools/build_deliverable_zip_safe.js");
  addHash("tools/build_deliverable_zip.js", "tools/build_deliverable_zip.js");

  const outPath = path.join(deliverableDir, "TOOLING_HASHES.txt");
  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
}

function guardDeliverablePacket({ caseRoot, caseId }) {
  const deliverableDir = path.join(caseRoot, "Deliverable_Packet");
  if (!fs.existsSync(deliverableDir)) {
    throw new Error(`Missing Deliverable_Packet folder: ${deliverableDir}`);
  }

  const tokens = getLeakTokens();
  const patterns = PATH_PATTERNS.concat(tokenRegexes(tokens));

  // Only sanitize operator summary
  const runSummary = path.join(deliverableDir, "RUN_SUMMARY.txt");
  sanitizeRunSummary(runSummary, caseId, tokens);

  // Add tooling hashes for defensibility
  writeToolingHashes(caseRoot);

  // Completeness gate first (prevents "clean but empty" packets)
  enforceCompleteness(deliverableDir);

  // Leak scans
  const opts = { maxHits: 50, maxTextBytes: 2 * 1024 * 1024 };
  const hits1 = scanTextFilesForLeaks(deliverableDir, patterns, opts);
  const hits2 = scanExifMetadataForLeaks(deliverableDir, patterns, opts);
  const hits = hits1.concat(hits2);

  if (hits.length) {
    const msg =
      "[FAIL] Leakage detected inside Deliverable_Packet:\n" +
      hits.map(h => `- ${h.file} [${h.pattern}] sample: ${h.sample}`).join("\n");
    const err = new Error(msg);
    err.name = "DELIVERABLE_LEAKAGE";
    throw err;
  }
}

module.exports = { guardDeliverablePacket };
