/**
 * Intake Prepare (v1)
 * - Takes a complaint PDF (already extracted by intake_extract.js)
 * - Auto-selects target domains with deterministic heuristics
 * - Emits complaint.txt + targets.txt
 * - Writes INTAKE_SUMMARY.txt so the operator never sees "blank tabs" confusion
 *
 * Behavior:
 * - If selected_targets.txt exists and has >=1 line, it is treated as an explicit override and validated.
 * - Else, the system auto-picks and writes selected_targets.txt for auditability.
 * - If auto-pick cannot reach minimum confidence, it fails hard (no silent empty outputs).
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function die(msg) {
  console.error("ERROR:", msg);
  process.exit(1);
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) return null;
  return v;
}

function readLines(p) {
  return fs
    .readFileSync(p, "utf8")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !s.startsWith("#"));
}

function normDomain(d) {
  return String(d || "").trim().toLowerCase();
}

function uniq(arr) {
  const out = [];
  const seen = new Set();
  for (const x of arr) {
    const k = String(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function extractWindowScore(textLower, domain) {
  // Deterministic light heuristic: score if domain appears near website-ish language
  // No ML, no web calls, no guessing beyond the PDF text itself.
  const d = normDomain(domain);
  if (!d) return 0;

  const idx = textLower.indexOf(d);
  if (idx === -1) return 0;

  const left = Math.max(0, idx - 220);
  const right = Math.min(textLower.length, idx + d.length + 220);
  const windowText = textLower.slice(left, right);

  let score = 0;

  // Strong cues
  const strong = [
    "defendant",
    "defendants",
    "website",
    "site",
    "web site",
    "online",
    "public accommodation",
    "www.",
    "http://",
    "https://",
    "domain",
    "url",
  ];

  // Common complaint formatting cues
  const legalish = [
    "owns",
    "operates",
    "operated",
    "maintains",
    "maintained",
    "controls",
    "controlled",
    "offers",
    "services",
    "goods",
    "access",
    "accessible",
    "inaccessible",
    "screen reader",
    "keyboard",
    "wcag",
    "title iii",
    "ada",
  ];

  for (const s of strong) if (windowText.includes(s)) score += 8;
  for (const s of legalish) if (windowText.includes(s)) score += 2;

  // Slight bonus if it appears early (caption / intro)
  if (idx < 4000) score += 6;
  if (idx < 12000) score += 3;

  // Penalize if it looks like an email domain only (very weak, but helps)
  if (windowText.includes("@") && !windowText.includes("http")) score -= 2;

  return score;
}

function autoPickDomains(extractedText, candidates) {
  const text = String(extractedText || "");
  const textLower = text.toLowerCase();

  const domains = (candidates.domains || [])
    .map((d) => normDomain(d.domain))
    .filter(Boolean);

  const uniqueDomains = uniq(domains);

  if (uniqueDomains.length === 0) {
    return { picks: [], reason: "no_candidates" };
  }

  if (uniqueDomains.length === 1) {
    return { picks: uniqueDomains, reason: "single_candidate" };
  }

  // Score each candidate
  const scored = uniqueDomains.map((d) => {
    const score = extractWindowScore(textLower, d);
    return { domain: d, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const top = scored[0];
  const second = scored[1];

  // Confidence rule (deterministic):
  // - top score must be >= 10
  // - and beat second by >= 4, OR second score < 10
  const confident =
    top.score >= 10 && (top.score - second.score >= 4 || second.score < 10);

  if (!confident) {
    return {
      picks: [],
      reason: "low_confidence",
      scored,
    };
  }

  return {
    picks: [top.domain],
    reason: "scored_pick",
    scored,
  };
}

function main() {
  const pdfPath = argValue("--pdf");
  const outDir = argValue("--out") || path.join(process.cwd(), "_intake_out");
  const minChars = Number(argValue("--min-chars") || "50");

  if (!pdfPath) die("Missing --pdf <path_to_pdf>");
  if (!fs.existsSync(pdfPath)) die(`PDF not found: ${pdfPath}`);

  fs.mkdirSync(outDir, { recursive: true });

  const extractor = path.join(process.cwd(), "tools", "intake", "intake_extract.js");
  if (!fs.existsSync(extractor)) die(`Missing extractor: ${extractor}`);

  // Step 1: run extractor to produce extracted_text.txt and candidates.json
  const r = spawnSync(process.execPath, [extractor, "--pdf", pdfPath, "--out", outDir], {
    stdio: "inherit",
  });
  if (r.status !== 0) process.exit(r.status || 1);

  const candidatesPath = path.join(outDir, "candidates.json");
  const extractedTextPath = path.join(outDir, "extracted_text.txt");

  if (!fs.existsSync(candidatesPath)) die(`Missing candidates.json: ${candidatesPath}`);
  if (!fs.existsSync(extractedTextPath)) die(`Missing extracted_text.txt: ${extractedTextPath}`);

  const extracted = fs.readFileSync(extractedTextPath, "utf8");
  if (extracted.trim().length < minChars) {
    die(
      [
        "Extracted complaint text is too short, refusing to write complaint.txt.",
        `chars=${extracted.trim().length}, min=${minChars}`,
        `source=${extractedTextPath}`,
      ].join("\n")
    );
  }

  const candidates = JSON.parse(fs.readFileSync(candidatesPath, "utf8"));
  const candidateSet = new Set((candidates.domains || []).map((d) => normDomain(d.domain)));

  const selectedPath = path.join(outDir, "selected_targets.txt");
  const complaintOut = path.join(outDir, "complaint.txt");
  const targetsOut = path.join(outDir, "targets.txt");
  const summaryOut = path.join(outDir, "INTAKE_SUMMARY.txt");

  let selected = [];
  let selectionMode = "auto";

  // Override path: if selected_targets.txt exists and has content, use it
  if (fs.existsSync(selectedPath)) {
    const lines = readLines(selectedPath).map(normDomain);
    if (lines.length > 0) {
      selectionMode = "human_override";
      selected = lines;
    }
  }

  // Auto path: if no override, auto-pick
  let autoMeta = null;
  if (selected.length === 0) {
    autoMeta = autoPickDomains(extracted, candidates);
    if (!autoMeta.picks.length) {
      const scored = autoMeta.scored
        ? autoMeta.scored.map((x) => `  - ${x.domain} (score=${x.score})`).join("\n")
        : "  (no scores)";

      die(
        [
          "Auto-pick could not reach confidence, refusing to proceed.",
          `reason=${autoMeta.reason}`,
          "",
          "Fix options (pick ONE):",
          `1) Create ${selectedPath} with ONE domain per line, chosen from candidates_flat.txt`,
          "2) Improve candidates extraction or complaint parsing rules",
          "",
          "Scored candidates:",
          scored,
        ].join("\n")
      );
    }

    selected = autoMeta.picks;
    selectionMode = `auto:${autoMeta.reason}`;

    // Write the selected_targets.txt so there is always an auditable record
    fs.writeFileSync(selectedPath, selected.join("\n") + "\n", { encoding: "utf8" });
  }

  // Validate selected against candidates
  const unknown = selected.filter((s) => !candidateSet.has(normDomain(s)));
  if (unknown.length) {
    die(
      [
        "selected_targets contains domains not present in candidates.json.",
        "Unknown:",
        ...unknown.map((x) => `  - ${x}`),
        "",
        `Fix ${selectedPath} so each line matches a candidate domain exactly.`,
      ].join("\n")
    );
  }

  // Emit downstream inputs
  fs.writeFileSync(complaintOut, extracted, { encoding: "utf8" });
  fs.writeFileSync(targetsOut, selected.map(normDomain).join("\n") + "\n", { encoding: "utf8" });

  // Summary file (always non-empty, no blank tabs confusion)
  const summaryLines = [
    "ACCESS FORENSICS INTAKE SUMMARY",
    `generated_utc: ${new Date().toISOString()}`,
    `selection_mode: ${selectionMode}`,
    `source_pdf: ${path.resolve(pdfPath)}`,
    "",
    `out_dir: ${path.resolve(outDir)}`,
    `extracted_text: ${path.resolve(extractedTextPath)}`,
    `candidates_json: ${path.resolve(candidatesPath)}`,
    `candidates_flat: ${path.resolve(path.join(outDir, "candidates_flat.txt"))}`,
    `selected_targets: ${path.resolve(selectedPath)}`,
    `complaint_out: ${path.resolve(complaintOut)}`,
    `targets_out: ${path.resolve(targetsOut)}`,
    "",
    "selected domains:",
    ...selected.map((d) => `- ${normDomain(d)}`),
    "",
  ];

  if (autoMeta && autoMeta.scored) {
    summaryLines.push("scoreboard:");
    for (const s of autoMeta.scored) summaryLines.push(`- ${s.domain} score=${s.score}`);
    summaryLines.push("");
  }

  fs.writeFileSync(summaryOut, summaryLines.join("\n"), { encoding: "utf8" });

  console.log("OK: prepared complaint:", complaintOut);
  console.log("OK: prepared targets  :", targetsOut);
  console.log("OK: summary           :", summaryOut);
  console.log("READY: wire complaint.txt + targets.txt into your pipeline runner next.");
}

try {
  main();
} catch (e) {
  die(e && e.stack ? e.stack : String(e));
}
