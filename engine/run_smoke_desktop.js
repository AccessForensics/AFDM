'use strict';

const path = require('path');
const { chromium } = require('playwright');

// Pull locked context options from the canonical intake context builder (allowlisted).
const contextFactory = require('../src/engine/intake/contextfactory.js');

function loadManifest(filename) {
  const p = path.join(__dirname, '..', 'manifests', filename);
  // eslint-disable-next-line import/no-dynamic-require, global-require
  return require(p);
}

async function main() {
  const manifest = loadManifest('smoke_desktop.json');

  const browser = await chromium.launch({ headless: true });
  try {
    const ctxOpts = contextFactory.getDesktopContextOptions();
    const context = await browser.newContext(ctxOpts);
    const page = await context.newPage();

    await page.goto(manifest.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.close();
    await context.close();
  } finally {
    await browser.close();
  }

  // Intentionally minimal: smoke should only prove context instantiation + navigation.
  console.log('[OK] smoke desktop');
}

if (require.main === module) {
  main().catch((e) => {
    console.error('[FAIL] smoke desktop:', e && e.stack ? e.stack : e);
    process.exit(1);
  });
}