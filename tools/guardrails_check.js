'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

function fail(msg) {
  console.error('[FAIL] ' + msg);
  process.exit(1);
}

function main() {
  const repo = process.cwd();
  // HARD FAIL: legacy manifests/smoke.json must not exist in governed tree
  const legacySmoke = path.join(repo, 'manifests', 'smoke.json');
  if (fs.existsSync(legacySmoke)) {
    fail('LEGACY_SMOKE_JSON_PRESENT: remove manifests/smoke.json (use smoke_desktop.json + smoke_mobile.json only)');
  }
// A) src enums file must be exact allowlisted one-liner
  const allowlisted = "module.exports = require('../../../engine/intake/enums.js');\n";
  const srcEnums = path.join(repo, 'src', 'engine', 'intake', 'enums.js');
  if (!fs.existsSync(srcEnums)) fail('Missing ' + srcEnums);
  const srcBody = readText(srcEnums).replace(/^\uFEFF/, '');
  if (srcBody !== allowlisted) fail('src/engine/intake/enums.js must exactly match allowlisted one-liner');

  // B) No viewport/DPR drift outside allowlist (context-aware patterns)
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
    path.join(repo, 'manifests', 'smoke_desktop.json'),
    path.join(repo, 'manifests', 'smoke_mobile.json')
  ]);

  const files = walk(repo)
    .filter(p => !p.includes(path.join(repo, '.git')))
    .filter(p => !p.includes(path.join(repo, 'node_modules')))
    .filter(p => !p.includes(path.join(repo, 'dist')))
    .filter(p => !p.includes(path.join(repo, 'build')))
    .filter(p => !p.includes(path.join(repo, 'archive')))
    .filter(p => !p.includes(path.join(repo, '.yarn')))
    .filter(p => !p.includes(path.join(repo, '.pnpm')))
    .filter(p => /\.(js|json|md|txt|yml|yaml)$/i.test(p));

  for (const p of files) {
    if (allowlistPaths.has(p)) continue;
    const body = readText(p);
    for (const rx of bannedPatterns) {
      if (rx.test(body)) fail('BANNED_PATTERN in ' + path.relative(repo, p) + ' pattern=' + String(rx));
    }
  }

  // C) Manifests must match generator output exactly
  cp.execFileSync(process.execPath, [path.join('tools', 'manifest-generator.js')], { stdio: 'inherit' });
  const status = cp.execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
  if (status) fail('Manifest drift detected after generator run.\n' + status);

  // D) Single determination writer (actual writes, not template references)
  const writers = [];
  for (const p of files.filter(p => p.endsWith('.js'))) {
    const rel = path.relative(repo, p).replace(/\\/g, '/');
    const body = readText(p);

    const writesDetermination =
      (body.includes('DETERMINATION.txt') && /writeFile(Sync)?\s*\(/.test(body)) ||
      /writeFileSync\s*\([^)]*DETERMINATION\.txt/.test(body) ||
      /writeFile\s*\([^)]*DETERMINATION\.txt/.test(body);

    if (writesDetermination) writers.push(rel);
  }

  if (writers.length > 1) {
    fail('Multiple determination writers found: ' + JSON.stringify(writers));
  }
  if (writers.length === 1 && writers[0] !== 'src/engine/intake/orchestrator.js') {
    fail('Determination writer must be orchestrator. Found: ' + JSON.stringify(writers));
  }

  console.log('[OK] guardrails passed');
}

if (require.main === module) main();