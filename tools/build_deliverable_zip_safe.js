"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { guardDeliverablePacket } = require("./deliverable_guard");

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--caseRoot") out.caseRoot = argv[++i];
    else if (a.startsWith("--caseRoot=")) out.caseRoot = a.split("=", 2)[1];
    else out._.push(a);
  }
  return out;
}

function repoRoot() {
  return path.resolve(__dirname, "..");
}

function git(args) {
  return spawnSync("git", args, { encoding: "utf8", cwd: repoRoot() });
}

function gitOk(r) {
  return (r.status ?? 1) === 0;
}

function gitLine(args) {
  const r = git(args);
  if (!gitOk(r)) return "";
  return String(r.stdout || "").trim();
}

function gitLines(args) {
  const r = git(args);
  if (!gitOk(r)) return [];
  return String(r.stdout || "")
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);
}

function headHasPath(repoRel) {
  const r = git(["cat-file", "-e", `HEAD:${repoRel}`]);
  return gitOk(r);
}

function headObjectId(repoRel) {
  const r = git(["rev-parse", `HEAD:${repoRel}`]);
  if (!gitOk(r)) return "";
  return String(r.stdout || "").trim();
}

function indexHasPath(repoRel) {
  const set = new Set(gitLines(["ls-files"])); // index + HEAD
  return set.has(repoRel);
}

function indexBlobId(repoRel) {
  // hash of the staged content (or HEAD if not staged differently)
  const r = git(["hash-object", repoRel]);
  if (!gitOk(r)) return "";
  return String(r.stdout || "").trim();
}

function writeNote(caseRoot, lines) {
  try {
    const deliverableDir = path.join(caseRoot, "Deliverable_Packet");
    const outPath = path.join(deliverableDir, "BUILDER_TRACKING_NOTE.txt");
    fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
  } catch {
    // Never block zipping due to note write failure
  }
}

function resolveBuilderOrFail(caseRoot) {
  const allowUntracked = String(process.env.AF_ALLOW_UNTRACKED_BUILDER || "").trim() === "1";

  const preferred = [
    "tools/build_deliverable_zip.js",
    "tools/build_deliverable_zip.mjs",
    "scripts/build_deliverable_zip.js",
    "engine/build_deliverable_zip.js"
  ];

  const trackedSet = new Set(gitLines(["ls-files"]));
  for (const cand of preferred) {
    if (trackedSet.has(cand)) return cand;
  }

  const candidates = Array.from(trackedSet).filter(p =>
    /build.*deliverable.*zip\.(js|mjs)$/i.test(p) || /deliverable.*zip.*build\.(js|mjs)$/i.test(p)
  );

  if (candidates.length) {
    candidates.sort((a, b) => a.length - b.length);
    return candidates[0];
  }

  const untrackedFallback = "tools/build_deliverable_zip.js";
  const fallbackExists = fs.existsSync(path.join(repoRoot(), untrackedFallback));
  if (allowUntracked && fallbackExists) return untrackedFallback;

  const msg =
    "[FAIL] No deliverable builder found in git index or HEAD.\n" +
    "Fix options:\n" +
    "1) Stage and commit the real builder (best).\n" +
    "2) If you absolutely must run locally, set AF_ALLOW_UNTRACKED_BUILDER=1 (stamps UNTRACKED_OVERRIDE).\n";

  const err = new Error(msg);
  err.name = "BUILDER_NOT_FOUND";
  throw err;
}

function stampProvenance(caseRoot, builderRel) {
  const allowUntracked = String(process.env.AF_ALLOW_UNTRACKED_BUILDER || "").trim() === "1";

  const inIndex = indexHasPath(builderRel);
  const inHead = headHasPath(builderRel);

  const headCommit = gitLine(["rev-parse", "HEAD"]) || "(unknown)";
  const statusPorcelain = gitLine(["status", "--porcelain"]) || "";

  const idxBlob = inIndex ? (indexBlobId(builderRel) || "(unknown)") : "(none)";
  const headObj = inHead ? (headObjectId(builderRel) || "(unknown)") : "(none)";

  const lines = [
    "BUILDER_TRACKING_NOTE",
    `timestamp_utc: ${new Date().toISOString()}`,
    `head_commit: ${headCommit}`,
    `builder_rel: ${builderRel}`,
    `builder_index_blob_sha: ${idxBlob}`,
    `builder_head_object_sha: ${headObj}`
  ];

  if (inIndex && inHead) {
    lines.push("status: COMMITTED_HEAD");
    lines.push("note: builder exists in HEAD, reproducible from commit history");
  } else if (inIndex && !inHead) {
    lines.push("status: STAGED_ONLY");
    lines.push("note: builder is in git index but not in HEAD, reproducible only with your staged state");
    lines.push("risk: defensibility reduced until committed");
  } else if (!inIndex && allowUntracked) {
    lines.push("status: UNTRACKED_OVERRIDE");
    lines.push("override: AF_ALLOW_UNTRACKED_BUILDER=1");
    lines.push("risk: reproducibility and defensibility reduced (builder not versioned in git)");
  } else {
    lines.push("status: NOT_TRACKED");
    lines.push("risk: cannot verify builder provenance");
  }

  // Optional: show dirty working tree signal without listing files
  lines.push(statusPorcelain ? "repo_state: DIRTY" : "repo_state: CLEAN");

  writeNote(caseRoot, lines);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.caseRoot) {
    console.error("ERROR: --caseRoot is required");
    process.exit(2);
  }

  const caseRoot = path.resolve(args.caseRoot);
  const caseId = path.basename(caseRoot);

  // Guard before zipping (sanitizes RUN_SUMMARY, writes TOOLING_HASHES, completeness, leak scan)
  guardDeliverablePacket({ caseRoot, caseId });

  // Resolve builder
  const builderRel = resolveBuilderOrFail(caseRoot);
  const builderAbs = path.join(repoRoot(), builderRel);

  // Stamp provenance into packet
  stampProvenance(caseRoot, builderRel);

  const passThru = process.argv.slice(2);
  const r = spawnSync(process.execPath, [builderAbs, ...passThru], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}

main();
