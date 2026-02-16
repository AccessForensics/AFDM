"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { guardDeliverablePacket } = require("./deliverable_guard");

function repoRoot() { return path.resolve(__dirname, ".."); }
function repoRelFromAbs(absPath) { return path.relative(repoRoot(), absPath).split(path.sep).join("/"); }

function git(args) { return spawnSync("git", args, { encoding: "utf8", cwd: repoRoot() }); }
function gitOk(r) { return !!(r && typeof r.status === "number" && r.status === 0); }
function gitLine(args) { const r = git(args); if (!gitOk(r)) return ""; return String(r.stdout || "").trim(); }

function fileSha256(absPath) { const buf = fs.readFileSync(absPath); return crypto.createHash("sha256").update(buf).digest("hex"); }

function statusCounts() {
  const r = git(["status", "--porcelain=v1"]);
  if (!gitOk(r)) return { dirty: true, modified: 0, untracked: 0, total: 0 };
  const lines = String(r.stdout || "").split(/\r?\n/).map(s => s.trimEnd()).filter(Boolean);
  let modified = 0, untracked = 0;
  for (const ln of lines) { if (ln.indexOf("?? ") === 0) untracked++; else modified++; }
  return { dirty: lines.length > 0, modified, untracked, total: lines.length };
}

function headHasPath(repoRel) { return gitOk(git(["cat-file", "-e", `HEAD:${repoRel}`])); }
function headBlobOid(repoRel) { if (!headHasPath(repoRel)) return ""; return gitLine(["rev-parse", `HEAD:${repoRel}`]) || ""; }
function indexBlobOid(repoRel) {
  const line = gitLine(["ls-files", "-s", "--", repoRel]);
  if (!line) return "";
  const parts = line.split(/\s+/);
  return parts[1] || "";
}
function worktreeBlobOid(repoRel) { const r = git(["hash-object", "--", repoRel]); if (!gitOk(r)) return ""; return String(r.stdout || "").trim(); }
function escapeRegex(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\
function writeNote("); }

function sanitizeForCourtLine(line) {
  let s = String(line ?? "");

  // Redact Windows user paths (drive and UNC style), also file:// paths
  s = s.replace(/[A-Za-z]:\\Users\\[^\s]+/gi, "[REDACTED_PATH]");
  s = s.replace(/\\Users\\[^\s]+/gi, "[REDACTED_PATH]");
  s = s.replace(/file:\/\/\/[A-Za-z]:\/Users\/[^\s]+/gi, "file:///[REDACTED_PATH]");

  // Redact current OS username anywhere it appears as a token
  let uname = "";
  try { uname = (os.userInfo && os.userInfo().username) ? String(os.userInfo().username) : ""; } catch { uname = ""; }
  if (uname) {
    const re = new RegExp(`\\b${escapeRegex(uname)}\\b`, "gi");
    s = s.replace(re, "[REDACTED_USERNAME]");
  }

  return s;
}
function writeNote(caseRoot, lines) {
  
  lines = Array.isArray(lines) ? lines.map(sanitizeForCourtLine) : lines;
try {
    const deliverableDir = path.join(caseRoot, "Deliverable_Packet");
    const outPath = path.join(deliverableDir, "BUILDER_TRACKING_NOTE.txt");
    fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
  } catch { }
}

function resolveBuilderOrFail() {
  const allowUntracked = String(process.env.AF_ALLOW_UNTRACKED_BUILDER || "").trim() === "1";
  const preferred = ["tools/build_deliverable_zip.js","tools/build_deliverable_zip.mjs","scripts/build_deliverable_zip.js","engine/build_deliverable_zip.js"];

  const tracked = new Set((() => {
    const r = git(["ls-files"]);
    if (!gitOk(r)) return [];
    return String(r.stdout || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  })());

  for (const cand of preferred) { if (tracked.has(cand)) return cand; }

  const candidates = Array.from(tracked).filter(p =>
    /build.*deliverable.*zip\.(js|mjs)$/i.test(p) || /deliverable.*zip.*build\.(js|mjs)$/i.test(p)
  );
  if (candidates.length) { candidates.sort((a, b) => a.length - b.length); return candidates[0]; }

  const untrackedFallback = "tools/build_deliverable_zip.js";
  const fallbackExists = fs.existsSync(path.join(repoRoot(), untrackedFallback));
  if (allowUntracked && fallbackExists) return untrackedFallback;

  const err = new Error(
    "[FAIL] No deliverable builder found in git index or HEAD.\n" +
    "Fix: commit the builder. For non-final testing only: set AF_ALLOW_UNTRACKED_BUILDER=1."
  );
  err.name = "BUILDER_NOT_FOUND";
  throw err;
}

function extractToolingBundleArg(argv) {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--toolingBundle") return argv[i + 1] || "";
    if (a && a.indexOf("--toolingBundle=") === 0) return a.split("=", 2)[1] || "";
  }
  return "";
}
function stripToolingBundleArgs(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--toolingBundle") { i++; continue; }
    if (a && a.indexOf("--toolingBundle=") === 0) continue;
    out.push(a);
  }
  return out;
}
function parseCaseRoot(argv) {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--caseRoot") return argv[i + 1] || "";
    if (a && a.indexOf("--caseRoot=") === 0) return a.split("=", 2)[1] || "";
  }
  return "";
}

function safeSpawnOut(cmd, args, opts) {
  try {
    const r = spawnSync(cmd, args, { encoding: "utf8", cwd: repoRoot(), shell: !!(opts && opts.shell) });
    if (r && r.status === 0) return { ok: true, out: String(r.stdout || "").trim(), how: (opts && opts.how) || "" };
    return { ok: false, out: "", how: (opts && opts.how) || "" };
  } catch { return { ok: false, out: "", how: (opts && opts.how) || "" }; }
}

function npmFromUserAgent() {
  const ua = String(process.env.npm_config_user_agent || "");
  const m = ua.match(/\bnpm\/([0-9]+\.[0-9]+\.[0-9]+)/i);
  return m ? String(m[1]) : "";
}

function safeNpmVersion() {
  const candidates = process.platform === "win32" ? ["npm.cmd", "npm"] : ["npm"];
  for (const c of candidates) {
    const a = safeSpawnOut(c, ["-v"], { shell: false, how: `${c} direct` });
    if (a.ok && a.out) return { version: a.out, resolvedBy: a.how };

    const b = safeSpawnOut(c, ["-v"], { shell: true, how: `${c} shell` });
    if (b.ok && b.out) return { version: b.out, resolvedBy: b.how };
  }
  return { version: "(unknown)", resolvedBy: "(unknown)" };
}

function detectNpmVersion() {
  const fromUA = npmFromUserAgent();
  if (fromUA) return { version: fromUA, resolvedBy: "npm_config_user_agent" };
  return safeNpmVersion();
}

function parseBundlePrereqsFromVerifyOutput(text) {
  const lines = String(text || "").split(/\r?\n/);
  let inPrereqs = false;
  const prereqs = [];
  for (const ln of lines) {
    const s = ln.trim();
    if (!s) continue;
    const low = s.toLowerCase();
    if (low.includes("prerequisite commit")) { inPrereqs = true; continue; }
    if (low.includes("requires this prerequisite")) { inPrereqs = true; continue; }
    if (inPrereqs) {
      const m = s.match(/\b[0-9a-f]{40}\b/i);
      if (m) prereqs.push(m[0].toLowerCase());
      else if (low.includes("bundle contains") || low.includes("the bundle records")) inPrereqs = false;
    }
  }
  return prereqs;
}

function verifyToolingBundleOrFail(headCommit, toolingBundlePath, lines) {
  const allowNoBundle = String(process.env.AF_ALLOW_NO_TOOLING_BUNDLE || "").trim() === "1";
  const allowPrereqs = String(process.env.AF_ALLOW_TOOLING_BUNDLE_PREREQS || "").trim() === "1";

  if (!toolingBundlePath) {
    lines.push("tooling_bundle_verify: (none)");
    lines.push("tooling_bundle_prereq_count: (none)");
    lines.push("tooling_bundle_self_contained: (none)");
    lines.push("tooling_bundle_contains_head_commit: (none)");
    lines.push("tooling_bundle_copied_into_packet: (none)");
    if (!allowNoBundle) {
      lines.push("status: TOOLING_BUNDLE_REQUIRED_REFUSED");
      lines.push("policy: REFUSED (pass --toolingBundle <self-contained .bundle>, override AF_ALLOW_NO_TOOLING_BUNDLE=1 for non-final testing)");
      const err = new Error("[FAIL] Tooling bundle is REQUIRED. Pass --toolingBundle <path-to-self-contained-git-bundle>.");
      err.name = "TOOLING_BUNDLE_REQUIRED_REFUSED";
      throw err;
    }
    lines.push("status: TOOLING_BUNDLE_MISSING_OVERRIDE");
    lines.push("override: AF_ALLOW_NO_TOOLING_BUNDLE=1");
    return { abs: "", prereqCount: 0, containsHead: false };
  }

  const abs = path.resolve(toolingBundlePath);
  if (!fs.existsSync(abs)) {
    lines.push("tooling_bundle_verify: MISSING");
    if (!allowNoBundle) {
      lines.push("status: TOOLING_BUNDLE_MISSING_REFUSED");
      const err = new Error("[FAIL] Tooling bundle path does not exist: " + abs);
      err.name = "TOOLING_BUNDLE_MISSING_REFUSED";
      throw err;
    }
    lines.push("status: TOOLING_BUNDLE_MISSING_OVERRIDE");
    lines.push("override: AF_ALLOW_NO_TOOLING_BUNDLE=1");
    return { abs, prereqCount: 0, containsHead: false };
  }

  const verify = git(["bundle", "verify", abs]);
  const verifyText = (String(verify.stdout || "") + "\n" + String(verify.stderr || "")).trim();
  if (!gitOk(verify)) {
    lines.push("tooling_bundle_verify: FAIL");
    const err = new Error("[FAIL] git bundle verify failed.\n" + verifyText);
    err.name = "TOOLING_BUNDLE_VERIFY_FAILED";
    throw err;
  }

  const prereqs = parseBundlePrereqsFromVerifyOutput(verifyText);
  const prereqCount = prereqs.length;
  lines.push("tooling_bundle_verify: OK");
  lines.push(`tooling_bundle_prereq_count: ${prereqCount}`);
  lines.push(`tooling_bundle_self_contained: ${prereqCount === 0 ? "YES" : "NO"}`);

  if (prereqCount > 0 && !allowPrereqs) {
    lines.push("status: TOOLING_BUNDLE_PREREQS_REFUSED");
    lines.push("policy: REFUSED (bundle must be self-contained, create with: git bundle create <path>.bundle HEAD)");
    const err = new Error("[FAIL] Tooling bundle is NOT self-contained. Create: git bundle create <path>.bundle HEAD");
    err.name = "TOOLING_BUNDLE_PREREQS_REFUSED";
    throw err;
  }
  if (prereqCount > 0 && allowPrereqs) lines.push("override: AF_ALLOW_TOOLING_BUNDLE_PREREQS=1");

  const heads = git(["bundle", "list-heads", abs]);
  const headsText = (String(heads.stdout || "") + "\n" + String(heads.stderr || "")).trim();
  const containsHead = new RegExp(`(^|\\s)${headCommit}(\\s|$)`, "m").test(headsText);
  lines.push(`tooling_bundle_contains_head_commit: ${containsHead ? "YES" : "NO"}`);
  if (!containsHead) {
    lines.push("status: TOOLING_BUNDLE_HEAD_MISMATCH_REFUSED");
    const err = new Error("[FAIL] Tooling bundle does not include head_commit. Rebuild from this HEAD: git bundle create <path>.bundle HEAD");
    err.name = "TOOLING_BUNDLE_HEAD_MISMATCH_REFUSED";
    throw err;
  }

  return { abs, prereqCount, containsHead };
}

function copyToolingBundleIntoPacket(caseRoot, toolingAbs) {
  const deliverableDir = path.join(caseRoot, "Deliverable_Packet");
  const destName = "AF_TOOLING.bundle";
  const destAbs = path.join(deliverableDir, destName);
  fs.copyFileSync(toolingAbs, destAbs);
  return { copied: true, name: destName, abs: destAbs };
}

function stampProvenanceOrFail(caseRoot, builderRel, builderAbs, toolingBundlePath) {
  const allowUntracked = String(process.env.AF_ALLOW_UNTRACKED_BUILDER || "").trim() === "1";
  const allowStagedOnly = String(process.env.AF_ALLOW_STAGED_BUILDER || "").trim() === "1";
  const allowHeadMismatch = String(process.env.AF_ALLOW_HEAD_MISMATCH_BUILDER || "").trim() === "1";
  const allowDirtyRepo = String(process.env.AF_ALLOW_DIRTY_REPO || "").trim() === "1";
  const allowMissingLockfile = String(process.env.AF_ALLOW_MISSING_LOCKFILE || "").trim() === "1";
  const allowUnknownNpm = String(process.env.AF_ALLOW_UNKNOWN_NPM || "").trim() === "1";

  const headCommit = gitLine(["rev-parse", "HEAD"]) || "(unknown)";
  const branchName = gitLine(["rev-parse", "--abbrev-ref", "HEAD"]) || "(unknown)";
  const gitVersion = gitLine(["--version"]) || "(unknown)";
  const nodeVersion = process.version || "(unknown)";

  const npmUA = String(process.env.npm_config_user_agent || "");
  const npm = detectNpmVersion();
  if (npm.version === "(unknown)" && !allowUnknownNpm) {
    const err = new Error("[FAIL] npm_version could not be resolved. Ensure npm is on PATH. Override (non-final only): AF_ALLOW_UNKNOWN_NPM=1");
    err.name = "NPM_VERSION_UNKNOWN_REFUSED";
    throw err;
  }

  const playwrightVersion = safeSpawnOut(process.execPath, ["-p", "(()=>{try{return require('playwright/package.json').version}catch(e){return '(unknown)'}})()"], { shell: false, how: "node -p" });
  const playwrightV = (playwrightVersion.ok && playwrightVersion.out) ? playwrightVersion.out : "(unknown)";

  const idxOid = indexBlobOid(builderRel);
  const headOid = headBlobOid(builderRel);
  const wtOid = worktreeBlobOid(builderRel);
  const repoState = statusCounts();

  const fileHash = fs.existsSync(builderAbs) ? fileSha256(builderAbs) : "(missing)";

  const wrapperRel = repoRelFromAbs(__filename);
  const wIdx = indexBlobOid(wrapperRel);
  const wHead = headBlobOid(wrapperRel);
  const wWt = worktreeBlobOid(wrapperRel);
  const wHash = fs.existsSync(__filename) ? fileSha256(__filename) : "(missing)";

  const guardRel = "tools/deliverable_guard.js";
  const guardAbs = path.join(repoRoot(), guardRel);
  const gIdx = indexBlobOid(guardRel);
  const gHead = headBlobOid(guardRel);
  const gWt = worktreeBlobOid(guardRel);
  const gHash = fs.existsSync(guardAbs) ? fileSha256(guardAbs) : "(missing)";

  const lockRel = "package-lock.json";
  const lockAbs = path.join(repoRoot(), lockRel);
  const lockExists = fs.existsSync(lockAbs);
  const lockSha = lockExists ? fileSha256(lockAbs) : "(missing)";
  const lockIdx = indexBlobOid(lockRel);
  const lockHead = headBlobOid(lockRel);
  const lockWt = worktreeBlobOid(lockRel);

  let toolingBundleName = "(none)";
  let toolingBundleSha256 = "(none)";
  if (toolingBundlePath) {
    try {
      const abs = path.resolve(toolingBundlePath);
      toolingBundleName = path.basename(abs);
      toolingBundleSha256 = fs.existsSync(abs) ? fileSha256(abs) : "(missing)";
    } catch { toolingBundleName = "(error)"; toolingBundleSha256 = "(error)"; toolingBundleAbs = "(error)"; }
  }

  const inIndex = !!idxOid;
  const inHead = !!headOid;

  const lines = [
    "BUILDER_TRACKING_NOTE",
    `timestamp_utc: ${new Date().toISOString()}`,
    `head_commit: ${headCommit}`,
    `branch_name: ${branchName}`,
    `git_version: ${gitVersion}`,
    `node_version: ${nodeVersion}`,
    `npm_config_user_agent: ${npmUA || "(none)"}`,
    `npm_version: ${npm.version}`,
    `npm_version_resolved_by: ${npm.resolvedBy}`,
    `playwright_version: ${playwrightV}`,

    `wrapper_rel: ${wrapperRel}`,
    `wrapper_file_sha256: ${wHash}`,
    `wrapper_worktree_blob_oid_sha1: ${wWt || "(none)"}`,
    `wrapper_index_blob_oid_sha1: ${wIdx || "(none)"}`,
    `wrapper_head_blob_oid_sha1: ${wHead || "(none)"}`,

    `guard_rel: ${guardRel}`,
    `guard_file_sha256: ${gHash}`,
    `guard_worktree_blob_oid_sha1: ${gWt || "(none)"}`,
    `guard_index_blob_oid_sha1: ${gIdx || "(none)"}`,
    `guard_head_blob_oid_sha1: ${gHead || "(none)"}`,

    `lockfile_rel: ${lockRel}`,
    `lockfile_exists: ${lockExists ? "YES" : "NO"}`,
    `lockfile_sha256: ${lockSha}`,
    `lockfile_worktree_blob_oid_sha1: ${lockWt || "(none)"}`,
    `lockfile_index_blob_oid_sha1: ${lockIdx || "(none)"}`,
    `lockfile_head_blob_oid_sha1: ${lockHead || "(none)"}`,

    `builder_rel: ${builderRel}`,
    `builder_file_sha256: ${fileHash}`,
    `builder_worktree_blob_oid_sha1: ${wtOid || "(none)"}`,
    `builder_index_blob_oid_sha1: ${idxOid || "(none)"}`,
    `builder_head_blob_oid_sha1: ${headOid || "(none)"}`,

    `repo_state: ${repoState.dirty ? "DIRTY" : "CLEAN"}`,
    `repo_modified_count: ${repoState.modified}`,
    `repo_untracked_count: ${repoState.untracked}`,

    `tooling_bundle_path_abs: ${toolingBundleAbs}`,
    `tooling_bundle_filename: ${toolingBundleName}`,
    `tooling_bundle_sha256: ${toolingBundleSha256}`
  ];

  if (repoState.dirty && !allowDirtyRepo) {
    lines.push("status: REPO_DIRTY_REFUSED");
    lines.push("policy: REFUSED (set AF_ALLOW_DIRTY_REPO=1 only for non-final testing)");
    writeNote(caseRoot, lines);
    const err = new Error("[FAIL] Repo is DIRTY. Refusing to produce court artifact.");
    err.name = "REPO_DIRTY_REFUSED";
    throw err;
  }

  if (!lockExists && !allowMissingLockfile) {
    lines.push("status: LOCKFILE_REQUIRED_REFUSED");
    lines.push("policy: REFUSED (package-lock.json required)");
    writeNote(caseRoot, lines);
    const err = new Error("[FAIL] Missing package-lock.json. Refusing to produce court artifact.");
    err.name = "LOCKFILE_REQUIRED_REFUSED";
    throw err;
  }
  if (!lockExists && allowMissingLockfile) lines.push("override: AF_ALLOW_MISSING_LOCKFILE=1");

  if (!(wHead && wIdx && wWt && wHead === wIdx && wWt === wHead)) {
    lines.push("status: WRAPPER_NOT_COMMITTED_REFUSED");
    lines.push("policy: REFUSED (wrapper must match HEAD and index)");
    writeNote(caseRoot, lines);
    const err = new Error("[FAIL] Wrapper does not match HEAD and index. Commit wrapper or restore it to HEAD.");
    err.name = "WRAPPER_NOT_COMMITTED_REFUSED";
    throw err;
  }

  if (!(gHead && gIdx && gWt && gHead === gIdx && gWt === gHead)) {
    lines.push("status: GUARD_NOT_COMMITTED_REFUSED");
    lines.push("policy: REFUSED (deliverable_guard.js must match HEAD and index)");
    writeNote(caseRoot, lines);
    const err = new Error("[FAIL] deliverable_guard.js does not match HEAD and index. Commit guard or restore it to HEAD.");
    err.name = "GUARD_NOT_COMMITTED_REFUSED";
    throw err;
  }

  if (lockExists && !(lockHead && lockIdx && lockWt && lockHead === lockIdx && lockWt === lockHead)) {
    lines.push("status: LOCKFILE_NOT_COMMITTED_REFUSED");
    lines.push("policy: REFUSED (package-lock.json must match HEAD and index)");
    writeNote(caseRoot, lines);
    const err = new Error("[FAIL] package-lock.json does not match HEAD and index. Commit lockfile or restore it to HEAD.");
    err.name = "LOCKFILE_NOT_COMMITTED_REFUSED";
    throw err;
  }

  let toolingVerify;
  try { toolingVerify = verifyToolingBundleOrFail(headCommit, toolingBundlePath, lines); }
  catch (e) { writeNote(caseRoot, lines); throw e; }

  let copied;
  try {
    copied = toolingVerify && toolingVerify.abs ? copyToolingBundleIntoPacket(caseRoot, toolingVerify.abs) : { copied: false, name: "(none)", abs: "" };
  } catch (e) {
    lines.push("tooling_bundle_copied_into_packet: NO");
    lines.push("status: TOOLING_BUNDLE_COPY_FAILED");
    writeNote(caseRoot, lines);
    const err = new Error("[FAIL] Tooling bundle copy into packet failed.");
    err.name = "TOOLING_BUNDLE_COPY_FAILED";
    throw err;
  }

  lines.push(`tooling_bundle_copied_into_packet: ${copied.copied ? "YES" : "NO"}`);
  lines.push(`tooling_bundle_packet_name: ${copied.name || "(none)"}`);

  if (!copied.copied || !copied.abs || !fs.existsSync(copied.abs)) {
    lines.push("tooling_bundle_packet_sha256: (none)");
    lines.push("status: TOOLING_BUNDLE_COPY_FAILED");
    writeNote(caseRoot, lines);
    const err = new Error("[FAIL] Tooling bundle was required but is not present in packet after copy.");
    err.name = "TOOLING_BUNDLE_COPY_FAILED";
    throw err;
  }

  const packetSha = fileSha256(copied.abs).toLowerCase();
  const srcSha = String(toolingBundleSha256 || "").toLowerCase();
  lines.push(`tooling_bundle_packet_sha256: ${packetSha}`);
  if (srcSha && srcSha !== "(missing)" && srcSha !== "(none)" && packetSha !== srcSha) {
    lines.push("status: TOOLING_BUNDLE_COPY_HASH_MISMATCH");
    writeNote(caseRoot, lines);
    const err = new Error("[FAIL] Tooling bundle copy hash mismatch, packet differs from source.");
    err.name = "TOOLING_BUNDLE_COPY_HASH_MISMATCH";
    throw err;
  }

  if (inHead && inIndex && wtOid && headOid && idxOid && wtOid === headOid && idxOid === headOid) {
    lines.push("status: COMMITTED_HEAD");
    lines.push("note: builder matches HEAD and index, reproducible from commit history");
    writeNote(caseRoot, lines);
    return;
  }

  if (inHead && wtOid && headOid && wtOid !== headOid) {
    lines.push("status: HEAD_MISMATCH");
    if (!allowHeadMismatch) {
      lines.push("policy: REFUSED (set AF_ALLOW_HEAD_MISMATCH_BUILDER=1 only for non-final testing)");
      writeNote(caseRoot, lines);
      const err = new Error("[FAIL] Builder HEAD_MISMATCH. Commit builder changes, or reset builder to match HEAD.");
      err.name = "BUILDER_HEAD_MISMATCH_REFUSED";
      throw err;
    }
    lines.push("override: AF_ALLOW_HEAD_MISMATCH_BUILDER=1");
    writeNote(caseRoot, lines);
    return;
  }

  if (inIndex && !inHead) {
    lines.push("status: STAGED_ONLY");
    if (!allowStagedOnly) {
      lines.push("policy: REFUSED (set AF_ALLOW_STAGED_BUILDER=1 only for non-final testing)");
      writeNote(caseRoot, lines);
      const err = new Error("[FAIL] Builder STAGED_ONLY (not in HEAD). Commit the builder.");
      err.name = "BUILDER_STAGED_ONLY_REFUSED";
      throw err;
    }
    lines.push("override: AF_ALLOW_STAGED_BUILDER=1");
    writeNote(caseRoot, lines);
    return;
  }

  if (!inIndex && allowUntracked) {
    lines.push("status: UNTRACKED_OVERRIDE");
    lines.push("override: AF_ALLOW_UNTRACKED_BUILDER=1");
    writeNote(caseRoot, lines);
    return;
  }

  lines.push("status: NOT_TRACKED");
  writeNote(caseRoot, lines);
  const err = new Error("[FAIL] Builder NOT_TRACKED, refusing to produce artifact.");
  err.name = "BUILDER_NOT_TRACKED_REFUSED";
  throw err;
}

function psQuote(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

function findZipOrFail(caseRoot, caseId) {
  const name = `Deliverable_Packet_${caseId}.zip`;
  const candidates = [
    path.join(repoRoot(), name),
    path.join(caseRoot, name),
    path.join(caseRoot, "Deliverable_Packet", name),
  ];
  for (const p of candidates) { if (fs.existsSync(p)) return p; }

  const roots = [repoRoot(), caseRoot];
  let best = "";
  let bestMtime = 0;

  function scanDir(dir, depth) {
    if (depth < 0) return;
    let items;
    try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      const abs = path.join(dir, it.name);
      if (it.isFile()) {
        if (it.name === name || (it.name.toLowerCase().endsWith(".zip") && it.name.toLowerCase().includes(caseId.toLowerCase()))) {
          try {
            const st = fs.statSync(abs);
            const mt = +st.mtime;
            if (mt > bestMtime) { bestMtime = mt; best = abs; }
          } catch { }
        }
      } else if (it.isDirectory()) {
        scanDir(abs, depth - 1);
      }
    }
  }

  for (const r of roots) scanDir(r, 3);

  if (!best) {
    const err = new Error("[FAIL] Could not locate deliverable zip for caseId: " + caseId);
    err.name = "ZIP_NOT_FOUND";
    throw err;
  }
  return best;
}

function parseExpectedBundleHashFromNote(noteText) {
  const m = String(noteText || "").match(/tooling_bundle_packet_sha256:\s*([0-9a-f]{64})/i);
  return m ? String(m[1]).toLowerCase() : "";
}

function verifyZipEmbedsToolingBundleOrFail(caseRoot, caseId) {
  const allowNoZipVerify = String(process.env.AF_ALLOW_NO_ZIP_VERIFY || "").trim() === "1";

  if (process.platform !== "win32") {
    if (allowNoZipVerify) return;
    const err = new Error("[FAIL] ZIP verification requires Windows environment. Refusing on non-win32. Override (non-final only): AF_ALLOW_NO_ZIP_VERIFY=1");
    err.name = "ZIP_VERIFY_UNSUPPORTED_PLATFORM";
    throw err;
  }

  const deliverableDir = path.join(caseRoot, "Deliverable_Packet");
  const notePath = path.join(deliverableDir, "BUILDER_TRACKING_NOTE.txt");
  if (!fs.existsSync(notePath)) {
    const err = new Error("[FAIL] Missing BUILDER_TRACKING_NOTE.txt, cannot verify zip embeds tooling bundle.");
    err.name = "NOTE_MISSING";
    throw err;
  }
  const note = fs.readFileSync(notePath, "utf8");
  const expected = parseExpectedBundleHashFromNote(note);
  if (!expected) {
    const err = new Error("[FAIL] Note missing tooling_bundle_packet_sha256, cannot verify zip embeds tooling bundle.");
    err.name = "NOTE_PARSE_FAILED";
    throw err;
  }

  const zipAbs = path.resolve(findZipOrFail(caseRoot, caseId));
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "af_zipcheck_"));

  try {
    const psCmd = `Expand-Archive -LiteralPath ${psQuote(zipAbs)} -DestinationPath ${psQuote(tmpDir)} -Force`;
    let r = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", psCmd], { encoding: "utf8", cwd: repoRoot() });

    if (!r || r.status !== 0) {
      const t = spawnSync("tar", ["-xf", zipAbs, "-C", tmpDir], { encoding: "utf8", cwd: repoRoot() });
      if (!t || t.status !== 0) {
        const err = new Error(
          "[FAIL] ZIP extraction failed (Expand-Archive and tar fallback).\n" +
          String((r && (r.stdout || "")) || "") + "\n" + String((r && (r.stderr || "")) || "") + "\n" +
          String((t && (t.stdout || "")) || "") + "\n" + String((t && (t.stderr || "")) || "")
        );
        err.name = "ZIP_EXPAND_FAILED";
        throw err;
      }
    }

    function findFirstByName(root, filename) {
      let best = "";
      function walk(d) {
        let items;
        try { items = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const it of items) {
          const abs = path.join(d, it.name);
          if (it.isFile() && it.name === filename) { best = abs; return; }
          if (it.isDirectory()) { walk(abs); if (best) return; }
        }
      }
      walk(root);
      return best;
    }

    const extractedTooling = findFirstByName(tmpDir, "AF_TOOLING.bundle");
    if (!extractedTooling || !fs.existsSync(extractedTooling)) {
      const err = new Error("[FAIL] Zip does not contain AF_TOOLING.bundle.");
      err.name = "ZIP_MISSING_TOOLING_BUNDLE";
      throw err;
    }

    const zipToolingSha = fileSha256(extractedTooling).toLowerCase();
    if (zipToolingSha !== expected) {
      const err = new Error(`[FAIL] Zip AF_TOOLING.bundle SHA mismatch. zip=${zipToolingSha} expected(note)=${expected}`);
      err.name = "ZIP_TOOLING_HASH_MISMATCH";
      throw err;
    }

    const extractedNote = findFirstByName(tmpDir, "BUILDER_TRACKING_NOTE.txt");
    if (!extractedNote || !fs.existsSync(extractedNote)) {
      const err = new Error("[FAIL] Zip does not contain BUILDER_TRACKING_NOTE.txt.");
      err.name = "ZIP_MISSING_NOTE";
      throw err;
    }

    const noteSha = fileSha256(notePath).toLowerCase();
    const zipNoteSha = fileSha256(extractedNote).toLowerCase();
    if (zipNoteSha !== noteSha) {
      const err = new Error(`[FAIL] Zip BUILDER_TRACKING_NOTE.txt SHA mismatch. zip=${zipNoteSha} packet=${noteSha}`);
      err.name = "ZIP_NOTE_HASH_MISMATCH";
      throw err;
    }

    console.log("OK: zip embeds AF_TOOLING.bundle, sha matches note");
    console.log("OK: zip embeds BUILDER_TRACKING_NOTE.txt, sha matches packet");
    console.log("OK: zip_name:", path.basename(zipAbs));
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { }
  }
}

function main() {
  const argv = process.argv.slice(2);
  const caseRootArg = parseCaseRoot(argv);
  if (!caseRootArg) { console.error("ERROR: --caseRoot is required"); process.exit(2); }

  const caseRoot = path.resolve(caseRootArg);
  const caseId = path.basename(caseRoot);
  const toolingBundlePath = extractToolingBundleArg(argv);

  guardDeliverablePacket({ caseRoot, caseId });

  const builderRel = resolveBuilderOrFail();
  const builderAbs = path.join(repoRoot(), builderRel);

  stampProvenanceOrFail(caseRoot, builderRel, builderAbs, toolingBundlePath);

  const passThru = stripToolingBundleArgs(argv);
  const r = spawnSync(process.execPath, [builderAbs, ...passThru], { stdio: "inherit" });
  const code = (typeof r.status === "number") ? r.status : 1;

  if (code === 0) {
    try { verifyZipEmbedsToolingBundleOrFail(caseRoot, caseId); }
    catch (e) { console.error(String(e && e.message ? e.message : e)); process.exit(81); }
  }

  process.exit(code);
}

main();


