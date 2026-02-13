/*
  intake_extract.js
  Input:  --pdf <path_to_pdf> --out <output_dir>
  Output: extracted_text.txt, candidates.json, candidates_flat.txt

  Deterministic intent:
  - Extract per-page text with pdfjs-dist
  - Extract URL/domain candidates with page references
  - Enumerate, do not guess
*/
const fs = require("fs");
const path = require("path");

// pdfjs-dist v3 legacy CJS build:
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

// SUPPRESS_PDFJS_NOISE
// We only extract text, we do not render pages. pdfjs may warn about missing canvas polyfills and font baseUrl.
// Keep stderr readable for operators.
const _warn = console.warn;
console.warn = (...args) => {
  const msg = String(args && args[0] ? args[0] : "");
  if (msg.includes("Cannot polyfill `DOMMatrix`")) return;
  if (msg.includes("Cannot polyfill `Path2D`")) return;
  if (msg.includes("fetchStandardFontData: failed to fetch file")) return;
  _warn(...args);
};

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
  const b = fs.readFileSync(p);
  // pdfjs-dist expects Uint8Array, not Buffer
  return new Uint8Array(b);
}

function normalizeCandidate(raw) {
  if (!raw) return null;
  let s = String(raw).trim();

  // strip trailing punctuation
  s = s.replace(/[)\],.;:'"!?]+$/g, "");

  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      return u.hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  if (/^www\./i.test(s)) s = s.slice(4);
  s = s.split("/")[0];

  if (/@/.test(s)) return null;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)) return null;

  return s.toLowerCase();
}

function makeSnippet(text, start, end, radius = 80) {
  const a = Math.max(0, start - radius);
  const b = Math.min(text.length, end + radius);
  return text.slice(a, b).replace(/\s+/g, " ").trim();
}

// If PDF extraction split a domain into: "<letter> <rest-of-domain>"
// stitch it back deterministically, ex: "f renchconnection.com" -> "frenchconnection.com"
function maybeStitchLeadingLetter(pageText, raw, startIndex) {
  if (!pageText || !raw || typeof startIndex !== "number") return null;
  if (startIndex < 2) return null;

  const prev2 = pageText.slice(startIndex - 2, startIndex); // like "f "
  if (!/^[a-z]\s$/i.test(prev2)) return null;

  const stitched = (prev2[0] + raw).trim();
  // only accept if the stitched token is a plausible domain
  if (!/^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(stitched)) return null;

  return { raw: stitched, start: startIndex - 2 };
}

function extractMatches(pageText) {
  const out = [];

  const urlRe = /\bhttps?:\/\/[^\s<>"']+/gi;
  const domRe = /\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/gi;

  let m;
  while ((m = urlRe.exec(pageText)) !== null) {
    out.push({ raw: m[0], start: m.index, end: m.index + m[0].length, kind: "url" });
  }

  while ((m = domRe.exec(pageText)) !== null) {
    let raw = m[0];
    let start = m.index;
    let end = m.index + raw.length;

    // skip emails
    const prev = start > 0 ? pageText[start - 1] : "";
    const next = end < pageText.length ? pageText[end] : "";
    if (prev === "@" || next === "@") continue;

    // stitch single-letter prefix if present
    const stitched = maybeStitchLeadingLetter(pageText, raw, start);
    if (stitched) {
      raw = stitched.raw;
      start = stitched.start;
      end = start + raw.length;
    }

    out.push({ raw, start, end, kind: "domain" });
  }

  return out;
}

async function extractPdfPerPage(pdfPath) {
  const data = readFileBytes(pdfPath);
  const doc = await pdfjsLib.getDocument({
    data,
    // silence font baseUrl warnings in Node, we do not render
    disableFontFace: true,
    useSystemFonts: true,
  }).promise;

  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((it) => (it && it.str ? it.str : "")).filter(Boolean);
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

      if (!byDomain.has(normalized)) byDomain.set(normalized, { domain: normalized, occurrences: [] });
      byDomain.get(normalized).occurrences.push(occ);
    }
  }

  const domains = Array.from(byDomain.values()).sort((a, b) => a.domain.localeCompare(b.domain));
  for (const d of domains) d.occurrences.sort((a, b) => (a.page - b.page) || (a.start - b.start));

  const candidates = {
    version: "intake_candidates_v1",
    source_pdf: path.resolve(pdfPath),
    pages: pdf.numPages,
    generated_utc: new Date().toISOString(),
    domains,
    total_domains: domains.length,
    total_occurrences: occurrences.length,
  };

  const candidatesPath = path.join(outDir, "candidates.json");
  fs.writeFileSync(candidatesPath, JSON.stringify(candidates, null, 2), { encoding: "utf8" });

  const flatPath = path.join(outDir, "candidates_flat.txt");
  fs.writeFileSync(flatPath, domains.map((d) => d.domain).join("\n") + (domains.length ? "\n" : ""), { encoding: "utf8" });

  console.log("OK: extracted :", extractedTextPath);
  console.log("OK: candidates:", candidatesPath);
  console.log("OK: flat list :", flatPath);
}

main().catch((err) => die(err && err.stack ? err.stack : String(err)));
