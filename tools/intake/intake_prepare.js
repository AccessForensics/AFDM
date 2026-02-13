/*
  intake_prepare.js
  Input:  --pdf <path_to_pdf> --out <output_dir>
  Behavior:
    - Runs extraction
    - Requires selected_targets.txt (human-confirmed)
    - Validates selected targets are in candidates list
    - Emits complaint.txt + targets.txt for downstream pipeline use

  This intentionally blocks "auto-pick".
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
  return fs.readFileSync(p, "utf8")
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean)
    .filter(s => !s.startsWith("#"));
}

function main() {
  const pdfPath = argValue("--pdf");
  const outDir = argValue("--out") || path.join(process.cwd(), "_intake_out");
  if (!pdfPath) die("Missing --pdf <path_to_pdf>");
  if (!fs.existsSync(pdfPath)) die(`PDF not found: ${pdfPath}`);

  const extractor = path.join(process.cwd(), "tools", "intake", "intake_extract.js");

  const r = spawnSync(process.execPath, [extractor, "--pdf", pdfPath, "--out", outDir], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status || 1);

  const candidatesPath = path.join(outDir, "candidates.json");
  const extractedTextPath = path.join(outDir, "extracted_text.txt");
  const selectedPath = path.join(outDir, "selected_targets.txt");

  if (!fs.existsSync(candidatesPath)) die(`Missing candidates.json: ${candidatesPath}`);
  if (!fs.existsSync(extractedTextPath)) die(`Missing extracted_text.txt: ${extractedTextPath}`);

  if (!fs.existsSync(selectedPath)) {
    die(
      [
        "Missing selected_targets.txt (human-confirmation required).",
        `Create it here: ${selectedPath}`,
        "Put ONE domain per line, chosen from candidates_flat.txt.",
        "Example:",
        "  example.com",
        "  booking.example.com",
      ].join("\n")
    );
  }

  const candidates = JSON.parse(fs.readFileSync(candidatesPath, "utf8"));
  const candidateSet = new Set((candidates.domains || []).map(d => d.domain));

  const selected = readLines(selectedPath);
  if (!selected.length) die("selected_targets.txt exists but is empty. Add at least one domain.");

  const unknown = selected.filter(s => !candidateSet.has(s.toLowerCase()));
  if (unknown.length) {
    die(
      [
        "selected_targets.txt contains domains not present in candidates.json.",
        "Unknown:",
        ...unknown.map(x => `  - ${x}`),
        "",
        "Fix selected_targets.txt so every line matches one candidate domain exactly.",
      ].join("\n")
    );
  }

  // Emit normalized downstream inputs
  const complaintOut = path.join(outDir, "complaint.txt");
  const targetsOut = path.join(outDir, "targets.txt");

  // complaint.txt is the extracted text, stable and sourced
  const extracted = fs.readFileSync(extractedTextPath, "utf8");
  fs.writeFileSync(complaintOut, extracted, { encoding: "utf8" });

  // targets.txt is the selected list, stable and human confirmed
  fs.writeFileSync(targetsOut, selected.map(s => s.toLowerCase()).join("\n") + "\n", { encoding: "utf8" });

  console.log("OK: prepared complaint:", complaintOut);
  console.log("OK: prepared targets  :", targetsOut);
  console.log("READY: wire complaint.txt + targets.txt into your pipeline runner next.");
}

try { main(); } catch (e) { die(e && e.stack ? e.stack : String(e)); }
