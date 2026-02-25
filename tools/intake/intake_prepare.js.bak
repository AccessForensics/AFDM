/**
 * Intake Prepare (v1.1) [ONE DEFENDANT, ONE DOMAIN]
 *
 * Contract rules:
 * - exactly 1 target domain, always
 * - never write empty complaint.txt or targets.txt
 * - never "guess" when confidence is weak, fail hard with an actionable summary
 *
 * Inputs:
 *   --pdf <path_to_pdf>
 *   --out <output_dir>
 *   --min-chars <n> optional, default 50
 *
 * Outputs (in outDir):
 *   extracted_text.txt, candidates.json, candidates_flat.txt  [from intake_extract.js]
 *   selected_targets.txt   [written by auto-pick OR provided by override]
 *   complaint.txt          [copy of extracted_text.txt]
 *   targets.txt            [exactly one domain]
 *   INTAKE_SUMMARY.txt     [operator-visible truth, no blank tabs confusion]
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
  const d = normDomain(domain);
  if (!d) return 0;

  const idx = textLower.indexOf(d);
  if (idx === -1) return 0;

  const left = Math.max(0, idx - 220);
  const right = Math.min(textLower.length, idx + d.length + 220);
  const windowText = textLower.slice(left, right);

  let score = 0;

  const strong = [
    "defendant",
    "defendants",
    "website",
    "web site",
    "site",
    "online",
    "public accommodation",
    "domain",
    "url",
    "http://",
    "https://",
    "www.",
  ];

  const legalish = [
    "owns",
    "operates",
    "maintains",
    "controls",
    "goods",
    "services",
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

  // bonus if early
  if (idx < 4000) score += 6;
  else if (idx < 12000) score += 3;

  // mild penalty for email-ish contexts
  if (windowText.includes("@") && !windowText.includes("http")) score -= 2;

  return score;
}

function autoPickOneDomain(extractedText, candidates) {
  const text = String(extractedText || "");
  const textLower = text.toLowerCase();

  const domains = (candidates.domains || [])
    .map((d) => normDomain(d.domain))
    .filter(Boolean);

  const uniqueDomains = uniq(domains);

  if (uniqueDomains.length === 0) {
    return { pick: null, reason: "no_candidates", scored: [] };
  }

  if (uniqueDomains.length === 1) {
    return { pick: uniqueDomains[0], reason: "single_candidate", scored: [{ domain: uniqueDomains[0], score: 999 }] };
  }

  const scored = uniqueDomains.map((d) => ({ domain: d, score: extractWindowScore(textLower, d) }));
  scored.sort((a, b) => b.score - a.score);

  const top = scored[0];
  const second = scored[1];

  // Deterministic confidence gate:
  // - top >= 10
  // - and (top-second >= 6 OR second < 10)
  const confident = top.score >= 10 && (top.score - second.score >= 6 || second.score < 10);

  if (!confident) {
    return { pick: null, reason: "low_confidence", scored };
  }

  return { pick: top.domain, reason: "scored_pick", scored };
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

  // Run extractor
  const r = spawnSync(process.execPath, [extractor, "--pdf", pdfPath, "--out", outDir], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status || 1);

  const candidatesPath = path.join(outDir, "candidates.json");
  const extractedTextPath = path.join(outDir, "extracted_text.txt");
  const flatPath = path.join(outDir, "candidates_flat.txt");

  if (!fs.existsSync(candidatesPath)) die(`Missing candidates.json: ${candidatesPath}`);
  if (!fs.existsSync(extractedTextPath)) die(`Missing extracted_text.txt: ${extractedTextPath}`);

  const extracted = fs.readFileSync(extractedTextPath, "utf8");
  const extractedTrim = extracted.trim();
  if (extractedTrim.length < minChars) {
    die(
      [
        "Extracted complaint text is too short, refusing to proceed.",
        `chars=${extractedTrim.length}, min=${minChars}`,
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

  let selected = null;
  let selectionMode = "auto";
  let autoMeta = null;

  // If override exists, it MUST contain exactly one domain
  if (fs.existsSync(selectedPath)) {
    const lines = readLines(selectedPath).map(normDomain);
    if (lines.length > 0) {
      if (lines.length !== 1) {
        die(
          [
            "selected_targets.txt must contain EXACTLY ONE domain (one defendant, one domain).",
            `found=${lines.length}`,
            `path=${selectedPath}`,
          ].join("\n")
        );
      }
      selectionMode = "human_override";
      selected = lines[0];
    }
  }

  // Auto pick if no override
  if (!selected) {
    autoMeta = autoPickOneDomain(extracted, candidates);
    if (!autoMeta.pick) {
      const scoredLines = (autoMeta.scored || []).map((x) => `- ${x.domain} score=${x.score}`).join("\n");
      die(
        [
          "Auto-pick could not reach confidence, refusing to proceed.",
          `reason=${autoMeta.reason}`,
          "",
          "Because your rule is ONE defendant, ONE domain, this must be resolved explicitly.",
          "In the future UI this becomes a one-click confirmation, for now the file is the lock.",
          "",
          `Create ${selectedPath} with EXACTLY ONE line, chosen from: ${flatPath}`,
          "",
          "scoreboard:",
          scoredLines || "(no scores)",
        ].join("\n")
      );
    }
    selected = autoMeta.pick;
    selectionMode = `auto:${autoMeta.reason}`;

    // Always write selected_targets.txt for auditability
    fs.writeFileSync(selectedPath, selected + "\n", { encoding: "utf8" });
  }

  // Validate against candidates
  if (!candidateSet.has(normDomain(selected))) {
    die(
      [
        "Selected domain is not present in candidates.json.",
        `selected=${selected}`,
        `path=${selectedPath}`,
        "",
        "Fix candidates extraction or provide a corrected selected_targets.txt chosen from candidates_flat.txt.",
      ].join("\n")
    );
  }

  // Hard guard: never empty targets
  if (!selected || !normDomain(selected)) die("No target selected, refusing to write targets.txt.");

  // Emit downstream
  fs.writeFileSync(complaintOut, extracted, { encoding: "utf8" });
  fs.writeFileSync(targetsOut, normDomain(selected) + "\n", { encoding: "utf8" });

  // Summary (always non-empty)
  const summaryLines = [
    "ACCESS FORENSICS INTAKE SUMMARY",
    `generated_utc: ${new Date().toISOString()}`,
    `selection_mode: ${selectionMode}`,
    `source_pdf: ${path.resolve(pdfPath)}`,
    "",
    `out_dir: ${path.resolve(outDir)}`,
    `extracted_text: ${path.resolve(extractedTextPath)}`,
    `candidates_json: ${path.resolve(candidatesPath)}`,
    `candidates_flat: ${path.resolve(flatPath)}`,
    `selected_targets: ${path.resolve(selectedPath)}`,
    `complaint_out: ${path.resolve(complaintOut)}`,
    `targets_out: ${path.resolve(targetsOut)}`,
    "",
    "selected domain:",
    `- ${normDomain(selected)}`,
    "",
  ];

  if (autoMeta && autoMeta.scored && autoMeta.scored.length) {
    summaryLines.push("scoreboard:");
    for (const s of autoMeta.scored) summaryLines.push(`- ${s.domain} score=${s.score}`);
    summaryLines.push("");
  }

  fs.writeFileSync(summaryOut, summaryLines.join("\n"), { encoding: "utf8" });

  console.log("OK: prepared complaint:", complaintOut);
  console.log("OK: prepared target   :", targetsOut);
  console.log("OK: summary           :", summaryOut);
  console.log("READY: wire complaint.txt + targets.txt into your pipeline runner next.");
}

try {
  main();
} catch (e) {
  die(e && e.stack ? e.stack : String(e));
}
