"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { guardDeliverablePacket } = require("./deliverable_guard");

function repoRoot() {
  return path.resolve(__dirname, "..");
}

function git(args) {
  return spawnSync("git", args, { encoding: "utf8", cwd: repoRoot() });
}

function gitOk(r) {
  return !!(r && typeof r.status === "number" && r.status === 0);
}

function gitLine(args) {
  const r = git(args);
  if (!gitOk(r)) return "";
  return String(r.stdout || "").trim();
}

function fileSha256(absPath) {
  const buf = fs.readFileSync(absPath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function statusCounts() {
  const r = git(["status", "--porcelain=v1"]);
  if (!gitOk(r)) return { dirty: true, modified: 0, untracked: 0, total: 0 };

  const lines = String(r.stdout || "")
    .split(/\r?\n/)
    .map(s => s.trimEnd())
    .filter(Boolean);

  let modified = 0;
  let untracked = 0;

  for (const ln of lines) {
    if (ln.indexOf("?? ") === 0) untracked++;
    else modified++;
  }

  return { dirty: lines.length > 0, modified, untracked, total: lines.length };
}

function headHasPath(repoRel) {
  const r = git(["cat-file", "-e", `HEAD:${repoRel}`]);
  return gitOk(r);
}

function headBlobOid(repoRel) {
  if (!headHasPath(repoRel)) return "";
  return gitLine(["rev-parse", `HEAD:${repoRel}`]) || "";
}

function indexBlobOid(repoRel) {
  const line = gitLine(["ls-files", "-s", "--", repoRel]);
  if (!line) return "";
  const parts = line.split(/\s+/);
  return parts[1] || "";
}

function worktreeBlobOid(repoRel) {
  const r = git(["hash-object", "--", repoRel]);
  if (!gitOk(r)) return "";
  return String(r.stdout || "").trim();
}

function writeNote(caseRoot, lines) {
  try {
    const deliverableDir = path.join(caseRoot, "Deliverable_Packet");
    const outPath = path.join(deliverableDir, "BUILDER_TRACKING_NOTE.txt");
    fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
  } catch {
    // never block zipping due to note write failure
  }
}

function resolveBuilderOrFail() {
  const allowUntracked = String(process.env.AF_ALLOW_UNTRACKED_BUILDER || "").trim() === "1";

  const preferred = [
    "tools/build_deliverable_zip.js",
    "tools/build_deliverable_zip.mjs",
    "scripts/build_deliverable_zip.js",
    "engine/build_deliverable_zip.js"
  ];

  const tracked = new Set(
    (function () {
      const r = git(["ls-files"]);
      if (!gitOk(r)) return [];
      return String(r.stdout || "")
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean);
    })()
  );

  for (const cand of preferred) {
    if (tracked.has(cand)) return cand;
  }

  const candidates = Array.from(tracked).filter(p =>
    /build.*deliverable.*zip\.(js|mjs)$/i.test(p) || /deliverable.*zip.*build\.(js|mjs)$/i.test(p)
  );

  if (candidates.length) {
    candidates.sort((a, b) => a.length - b.length);
    return candidates[0];
  }

  const untrackedFallback = "tools/build_deliverable_zip.js";
  const fallbackExists = fs.existsSync(path.join(repoRoot(), untrackedFallback));
  if (allowUntracked && fallbackExists) return untrackedFallback;

  const err = new Error(
    "[FAIL] No deliverable builder found in git index or HEAD.\n" +
      "Fix options:\n" +
      "1) Commit the builder (best).\n" +
      "2) For non-final local testing only: set AF_ALLOW_UNTRACKED_BUILDER=1.\n"
  );
  err.name = "BUILDER_NOT_FOUND";
  throw err;
}

function stampProvenanceOrFail(caseRoot, builderRel, builderAbs, toolingBundlePath) {
  const allowUntracked = String(process.env.AF_ALLOW_UNTRACKED_BUILDER || "").trim() === "1";
  const allowStagedOnly = String(process.env.AF_ALLOW_STAGED_BUILDER || "").trim() === "1";
  const allowHeadMismatch = String(process.env.AF_ALLOW_HEAD_MISMATCH_BUILDER || "").trim() === "1";
  const allowDirtyRepo = String(process.env.AF_ALLOW_DIRTY_REPO || "").trim() === "1";

  const headCommit = gitLine(["rev-parse", "HEAD"]) || "(unknown)";

  const idxOid = indexBlobOid(builderRel);
  const headOid = headBlobOid(builderRel);
  const wtOid = worktreeBlobOid(builderRel);
  const repoState = statusCounts();

  const fileHash = fs.existsSync(builderAbs) ? fileSha256(builderAbs) : "(missing)";

  let toolingBundleName = "(none)";
  let toolingBundleSha256 = "(none)";
  if (toolingBundlePath) {
    try {
      const abs = path.resolve(toolingBundlePath);
      if (fs.existsSync(abs)) {
        toolingBundleName = path.basename(abs);
        toolingBundleSha256 = fileSha256(abs);
      } else {
        toolingBundleName = path.basename(abs);
        toolingBundleSha256 = "(missing)";
      }
    } catch {
      toolingBundleName = "(error)";
      toolingBundleSha256 = "(error)";
    }
  }

  const inIndex = !!idxOid;
  const inHead = !!headOid;

  const lines = [
    "BUILDER_TRACKING_NOTE",
    `timestamp_utc: ${new Date().toISOString()}`,
    `head_commit: ${headCommit}`,
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

  // Court-grade default: refuse DIRTY repos
  if (repoState.dirty && !allowDirtyRepo) {
    lines.push("status: REPO_DIRTY_REFUSED");
    lines.push("policy: REFUSED (set AF_ALLOW_DIRTY_REPO=1 only for non-final local testing)");
    writeNote(caseRoot, lines);
    const err = new Error(
      "[FAIL] Repo is DIRTY. Refusing to produce court artifact.\n" +
        "Fix: clean git status (no modified, no untracked) and rerun.\n" +
        "Override for non-final local testing only: set AF_ALLOW_DIRTY_REPO=1."
    );
    err.name = "REPO_DIRTY_REFUSED";
    throw err;
  }

  // Court-grade default: only when executed builder equals HEAD and equals index
  if (inHead && inIndex && wtOid && headOid && idxOid && wtOid === headOid && idxOid === headOid) {
    lines.push("status: COMMITTED_HEAD");
    lines.push("note: builder matches HEAD and index, reproducible from commit history");
    writeNote(caseRoot, lines);
    return;
  }

  // HEAD exists but worktree differs, refuse by default
  if (inHead && wtOid && headOid && wtOid !== headOid) {
    lines.push("status: HEAD_MISMATCH");
    lines.push("risk: builder executed does not match HEAD");
    if (!allowHeadMismatch) {
      lines.push("policy: REFUSED (set AF_ALLOW_HEAD_MISMATCH_BUILDER=1 only for non-final local testing)");
      writeNote(caseRoot, lines);
      const err = new Error(
        "[FAIL] Builder HEAD_MISMATCH. Executed builder differs from HEAD.\n" +
          "Fix: commit builder changes, or reset builder to match HEAD.\n" +
          "Override for non-final local testing only: set AF_ALLOW_HEAD_MISMATCH_BUILDER=1."
      );
      err.name = "BUILDER_HEAD_MISMATCH_REFUSED";
      throw err;
    }
    lines.push("override: AF_ALLOW_HEAD_MISMATCH_BUILDER=1");
    writeNote(caseRoot, lines);
    return;
  }

  // Staged-only, not in HEAD, refuse by default
  if (inIndex && !inHead) {
    lines.push("status: STAGED_ONLY");
    lines.push("risk: builder staged but not in HEAD, not reproducible from commit history");
    if (!allowStagedOnly) {
      lines.push("policy: REFUSED (set AF_ALLOW_STAGED_BUILDER=1 only for non-final local testing)");
      writeNote(caseRoot, lines);
      const err = new Error(
        "[FAIL] Builder STAGED_ONLY (not in HEAD). Refusing to produce court artifact.\n" +
          "Fix: commit the builder.\n" +
          "Override for non-final local testing only: set AF_ALLOW_STAGED_BUILDER=1."
      );
      err.name = "BUILDER_STAGED_ONLY_REFUSED";
      throw err;
    }
    lines.push("override: AF_ALLOW_STAGED_BUILDER=1");
    writeNote(caseRoot, lines);
    return;
  }

  // Untracked override only if explicitly set
  if (!inIndex && allowUntracked) {
    lines.push("status: UNTRACKED_OVERRIDE");
    lines.push("override: AF_ALLOW_UNTRACKED_BUILDER=1");
    lines.push("risk: reproducibility and defensibility reduced (builder not versioned in git)");
    writeNote(caseRoot, lines);
    return;
  }

  // Not tracked, always refuse
  lines.push("status: NOT_TRACKED");
  lines.push("risk: cannot verify builder provenance");
  writeNote(caseRoot, lines);

  const err = new Error("[FAIL] Builder NOT_TRACKED, refusing to produce artifact.");
  err.name = "BUILDER_NOT_TRACKED_REFUSED";
  throw err;
}

function extractToolingBundleArg(argv) {
  // Supports: --toolingBundle <path> or --toolingBundle=<path>
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

function main() {
  const argv = process.argv.slice(2);

  const caseRootArg = parseCaseRoot(argv);
  if (!caseRootArg) {
    console.error("ERROR: --caseRoot is required");
    process.exit(2);
  }

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
