'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

function fail(msg) {
  console.error('[FAIL] ' + msg);
  process.exit(1);
}

function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

// Iterative walk that ignores heavy/non-governed dirs at source
function walk(rootDir) {
  const out = [];
  const ignores = new Set(['.git', 'archive', 'node_modules', 'dist', 'build', '.yarn', '.pnpm']);

  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    const ents = fs.readdirSync(dir, { withFileTypes: true });

    for (const ent of ents) {
      if (ent.isDirectory() && ignores.has(ent.name)) continue;

      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) stack.push(p);
      else out.push(p);
    }
  }
  return out;
}

function main() {
  const repo = process.cwd();

  // A) src enums file must be exact allowlisted one-liner re-export
  const allowlistedEnumsLine = "module.exports = require('../../../engine/intake/enums.js');\n";
  const srcEnums = path.join(repo, 'src', 'engine', 'intake', 'enums.js');
  if (!fs.existsSync(srcEnums)) fail('Missing ' + srcEnums);
  const srcBody = readText(srcEnums).replace(/^\uFEFF/, '');
  if (srcBody !== allowlistedEnumsLine) {
    fail('src/engine/intake/enums.js must exactly match allowlisted one-liner');
  }

  // Build file list once, used by all checks
  const files = walk(repo).filter(p => /\.(js|json|md|txt|yml|yaml)$/i.test(p));
  if (!Array.isArray(files)) fail('GUARDRAILS_INTERNAL_ERROR: files list not built');

  // B) No viewport/DPR literals outside allowlist
  const bannedPatterns = [
    /deviceScaleFactor\s*[:=]\s*\d+/i,
    /viewport\s*[:=]\s*\{/i,
    /["'](width|height)["']\s*:\s*(390|393|844|852|1280|1366|720|900)\b/i
  ];

  const allowlistPaths = new Set([
    path.join(repo, 'engine', 'intake', 'enums.js'),
    path.join(repo, 'src', 'engine', 'intake', 'locked.js'),
    path.join(repo, 'src', 'engine', 'intake', 'contextfactory.js'),
    path.join(repo, 'tools', 'manifest-generator.js'),
    path.join(repo, 'tools', 'guardrails_check.js'),
    path.join(repo, 'manifests', 'smoke_desktop.json'),
    path.join(repo, 'manifests', 'smoke_mobile.json'),
    path.join(repo, 'manifests', 'smoke.json')
  ]);

  for (const p of files) {
    if (allowlistPaths.has(p)) continue;
    const body = readText(p);
    for (const rx of bannedPatterns) {
      if (rx.test(body)) {
        fail('BANNED_PATTERN in ' + path.relative(repo, p) + ' pattern=' + String(rx));
      }
    }
  }

  // C) Manifests must match generator output exactly
  cp.execFileSync(process.execPath, [path.join('tools', 'manifest-generator.js')], { stdio: 'inherit' });
  const status = cp.execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
  if (status) fail('Manifest drift detected after generator run.\n' + status);

    // D) Single determination writer (actual writes)
  // Enforce only on execution surface (src/ and engine/). Never scan tools/.
  const writerCandidates = files
    .filter(p => p.endsWith('.js'))
    .filter(p => {
      const rel = path.relative(repo, p).replace(/\\/g, '/');
      return (rel.startsWith('src/') || rel.startsWith('engine/'));
    });

  const writers = [];
  for (const p of writerCandidates) {
    const rel = path.relative(repo, p).replace(/\\/g, '/');
    const body = readText(p);

    const writesDetermination =
      (body.includes('DETERMINATION.txt') && /writeFile(Sync)?\s*\(/.test(body)) ||
      /writeFileSync\s*\([^)]*DETERMINATION\.txt/.test(body) ||
      /writeFile\s*\([^)]*DETERMINATION\.txt/.test(body);

    if (writesDetermination) writers.push(rel);
  }

  if (writers.length > 1) fail('Multiple determination writers found: ' + JSON.stringify(writers));
  if (writers.length === 1 && writers[0] !== 'src/engine/intake/orchestrator.js') {
    fail('Determination writer must be orchestrator. Found: ' + JSON.stringify(writers));
  }

  console.log('[OK] guardrails passed');}

if (require.main === module) main();