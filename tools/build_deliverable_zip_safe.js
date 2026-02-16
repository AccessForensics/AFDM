"use strict";

const fs = require("fs");
const path = require("path");
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

function writeNote(caseRoot, lines) {
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

function safeSpawnVersion(cmd, args) {
  try {
    const r = spawnSync(cmd, args, { encoding: "utf8", cwd: repoRoot() });
    if (r && r.status === 0) return String(r.stdout || "").trim() || "(unknown)";
    return "(unknown)";
  } catch { return "(unknown)"; }
}

function parseBundlePrereqsFromVerifyOutput(text) {
  const lines = String(text || "").split(/\r?\n/);
  let inPrereqs = false;
  const prereqs = [];
  for (const ln of lines) {
    const s = ln.trim();
    if (!s) continue;
    if (s.toLowerCase().includes("prerequisite commit")) { inPrereqs = true; continue; }
    if (inPrereqs) {
      const m = s.match(/\b[0-9a-f]{40}\b/i);
      if (m) prereqs.push(m[0].toLowerCase());
      else if (s.toLowerCase().includes("bundle contains") || s.toLowerCase().includes("the bundle records")) inPrereqs = false;
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
  const containsHead = headsText.includes(headCommit);
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
  try { fs.copyFileSync(toolingAbs, destAbs); return { copied: true, name: destName, abs: destAbs }; }
  catch { return { copied: false, name: destName, abs: destAbs }; }
}

function stampProvenanceOrFail(caseRoot, builderRel, builderAbs, toolingBundlePath) {
  const allowUntracked = String(process.env.AF_ALLOW_UNTRACKED_BUILDER || "").trim() === "1";
  const allowStagedOnly = String(process.env.AF_ALLOW_STAGED_BUILDER || "").trim() === "1";
  const allowHeadMismatch = String(process.env.AF_ALLOW_HEAD_MISMATCH_BUILDER || "").trim() === "1";
  const allowDirtyRepo = String(process.env.AF_ALLOW_DIRTY_REPO || "").trim() === "1";
  const allowMissingLockfile = String(process.env.AF_ALLOW_MISSING_LOCKFILE || "").trim() === "1";

  const headCommit = gitLine(["rev-parse", "HEAD"]) || "(unknown)";
  const branchName = gitLine(["rev-parse", "--abbrev-ref", "HEAD"]) || "(unknown)";
  const gitVersion = gitLine(["--version"]) || "(unknown)";
  const nodeVersion = process.version || "(unknown)";
  const npmVersion = safeSpawnVersion("npm", ["-v"]);
  const playwrightVersion = safeSpawnVersion(process.execPath, ["-p", "(()=>{try{return require('playwright/package.json').version}catch(e){return '(unknown)'}})()"]);

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
    } catch { toolingBundleName = "(error)"; toolingBundleSha256 = "(error)"; }
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
    `npm_version: ${npmVersion}`,
    `playwright_version: ${playwrightVersion}`,

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

  let toolingVerify;
  try { toolingVerify = verifyToolingBundleOrFail(headCommit, toolingBundlePath, lines); }
  catch (e) { writeNote(caseRoot, lines); throw e; }

  const copied = toolingVerify && toolingVerify.abs ? copyToolingBundleIntoPacket(caseRoot, toolingVerify.abs) : { copied: false, name: "(none)", abs: "" };
  lines.push(`tooling_bundle_copied_into_packet: ${copied.copied ? "YES" : "NO"}`);
  lines.push(`tooling_bundle_packet_name: ${copied.name || "(none)"}`);
  if (copied.copied && copied.abs && fs.existsSync(copied.abs)) lines.push(`tooling_bundle_packet_sha256: ${fileSha256(copied.abs)}`);
  else lines.push("tooling_bundle_packet_sha256: (none)");

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
  process.exit(typeof r.status === "number" ? r.status : 1);
}

main();
