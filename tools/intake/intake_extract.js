/*
  intake_extract.js
  Input:  --pdf <path_to_pdf> --out <output_dir>
  Output: extracted_text.txt, candidates.json, candidates_flat.txt

  Deterministic intent:
  - Extract per-page text with pdfjs-dist
  - Extract URL/domain candidates with page references
  - No guessing which target is "correct", just enumerate and cite evidence locations
*/
const fs = require("fs");
const path = require("path");
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

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

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readFileBytes(p) {
  return fs.readFileSync(p);
}

function normalizeCandidate(raw) {
  if (!raw) return null;
  let s = String(raw).trim();

  // Strip common trailing punctuation
  s = s.replace(/[)\],.;:'"!?]+$/g, "");

  // If URL, parse hostname
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      return u.hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  // If starts with www., keep it as hostname
  if (/^www\./i.test(s)) s = s.slice(4);

  // Remove any path segment if present
  s = s.split("/")[0];

  // Reject emails
  if (/@/.test(s)) return null;

  // Basic domain sanity: must contain a dot, no spaces
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)) return null;

  return s.toLowerCase();
}

function makeSnippet(text, start, end, radius = 80) {
  const a = Math.max(0, start - radius);
  const b = Math.min(text.length, end + radius);
  const snippet = text.slice(a, b).replace(/\s+/g, " ").trim();
  return snippet;
}

function extractMatches(pageText) {
  const out = [];

  // URLs
  const urlRe = /\bhttps?:\/\/[^\s<>"']+/gi;

  // Bare domains (avoid capturing file extensions in weird strings as best effort)
  // Examples: example.com, sub.example.co.uk, www.example.com
  const domRe = /\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/gi;

  let m;
  while ((m = urlRe.exec(pageText)) !== null) {
    out.push({ raw: m[0], start: m.index, end: m.index + m[0].length, kind: "url" });
  }

  while ((m = domRe.exec(pageText)) !== null) {
    const raw = m[0];

    // Heuristic: skip if preceded or followed by @ (email)
    const prev = m.index > 0 ? pageText[m.index - 1] : "";
    const next = m.index + raw.length < pageText.length ? pageText[m.index + raw.length] : "";
    if (prev === "@" || next === "@") continue;

    out.push({ raw, start: m.index, end: m.index + raw.length, kind: "domain" });
  }

  return out;
}

async function extractPdfPerPage(pdfPath) {
  const data = readFileBytes(pdfPath);
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map(it => (it && it.str ? it.str : "")).filter(Boolean);

    // Keep it stable: join with single spaces, normalize whitespace
    const text = strings.join(" ").replace(/\s+/g, " ").trim();
    pages.push({ page: i, text });
  }

  return { numPages: doc.numPages, pages };
}

async function main() {
  const pdfPath = argValue("--pdf");
  const outDir = argValue("--out") || path.join(process.cwd(), "_intake_out");

  if (!pdfPath) die("Missing --pdf <path_to_pdf>");
  if (!fs.existsSync(pdfPath)) die(`PDF not found: ${pdfPath}`);

  ensureDir(outDir);

  const pdf = await extractPdfPerPage(pdfPath);

  // Write extracted_text.txt with page headers
  const extractedTextPath = path.join(outDir, "extracted_text.txt");
  const lines = [];
  lines.push(`# SOURCE_PDF: ${path.resolve(pdfPath)}`);
  lines.push(`# PAGES: ${pdf.numPages}`);
  lines.push("");

  for (const p of pdf.pages) {
    lines.push(`=== PAGE ${p.page} ===`);
    lines.push(p.text || "");
    lines.push("");
  }

  fs.writeFileSync(extractedTextPath, lines.join("\n"), { encoding: "utf8" });

  // Candidate extraction with page evidence
  const occurrences = [];
  const byDomain = new Map();

  for (const p of pdf.pages) {
    const pageText = p.text || "";
    if (!pageText) continue;

    const matches = extractMatches(pageText);
    for (const hit of matches) {
      const normalized = normalizeCandidate(hit.raw);
      if (!normalized) continue;

      const occ = {
        domain: normalized,
        raw: hit.raw,
        kind: hit.kind,
        page: p.page,
        start: hit.start,
        end: hit.end,
        snippet: makeSnippet(pageText, hit.start, hit.end, 90),
      };

      occurrences.push(occ);

      if (!byDomain.has(normalized)) {
        byDomain.set(normalized, { domain: normalized, occurrences: [] });
      }
      byDomain.get(normalized).occurrences.push(occ);
    }
  }

  // Stable sort: domain asc, then page asc, then start asc
  const domains = Array.from(byDomain.values()).sort((a, b) => a.domain.localeCompare(b.domain));
  for (const d of domains) {
    d.occurrences.sort((a, b) => (a.page - b.page) || (a.start - b.start));
  }

  const candidates = {
    version: "intake_candidates_v1",
    source_pdf: path.resolve(pdfPath),
    pages: pdf.numPages,
    generated_utc: new Date().toISOString(),
    domains,
    total_domains: domains.length,
    total_occurrences: occurrences.length
  };

  const candidatesPath = path.join(outDir, "candidates.json");
  fs.writeFileSync(candidatesPath, JSON.stringify(candidates, null, 2), { encoding: "utf8" });

  const flatPath = path.join(outDir, "candidates_flat.txt");
  fs.writeFileSync(flatPath, domains.map(d => d.domain).join("\n") + (domains.length ? "\n" : ""), { encoding: "utf8" });

  console.log("OK: extracted:", extractedTextPath);
  console.log("OK: candidates:", candidatesPath);
  console.log("OK: flat list :", flatPath);
  console.log("NOTE: Next step is human confirmation, create selected_targets.txt in the same folder as candidates.json.");
}

main().catch(err => die(err && err.stack ? err.stack : String(err)));
