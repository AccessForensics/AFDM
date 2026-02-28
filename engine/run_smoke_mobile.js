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
  const manifest = loadManifest('smoke_mobile.json');

  const browser = await chromium.launch({ headless: true });
  try {
    const ctxOpts = contextFactory.getMobileContextOptions();
    const context = await browser.newContext(ctxOpts);
    const page = await context.newPage();

    await page.goto(manifest.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.close();
    await context.close();
  } finally {
    await browser.close();
  }

  console.log('[OK] smoke mobile');
}

if (require.main === module) {
  main().catch((e) => {
    console.error('[FAIL] smoke mobile:', e && e.stack ? e.stack : e);
    process.exit(1);
  });
}