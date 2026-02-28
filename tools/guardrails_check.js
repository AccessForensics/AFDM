'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

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

function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

function fail(msg) {
  console.error('[FAIL] ' + msg);
  process.exit(1);
}

function main() {
  const repo = process.cwd();
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