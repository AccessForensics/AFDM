const fs = require("fs");
const path = require("path");

const artifactsDir = path.join(process.cwd(), "artifacts");
if (!fs.existsSync(artifactsDir)) { console.error("[FATAL] artifacts/ not found"); process.exit(2); }

const dirs = fs.readdirSync(artifactsDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
const journals = dirs.map(d => path.join(artifactsDir, d, "journal.ndjson")).filter(p => fs.existsSync(p))
  .map(p => ({ p, m: fs.statSync(p).mtimeMs }))
  .sort((a,b) => b.m - a.m);

if (!journals.length) { console.error("[FATAL] no journal.ndjson found"); process.exit(3); }

const newest = journals[0].p;
const txt = fs.readFileSync(newest, "utf8");
if (!txt.includes('"t":"ENV"')) { console.error("[FATAL] newest journal missing ENV:", newest); process.exit(4); }

console.log("[OK] newest journal has ENV ->", newest);
process.exit(0);