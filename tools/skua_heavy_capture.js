const contextFactory = require('../src/engine/intake/contextfactory.js');
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium, devices } = require("playwright");

async function runCapture(env, url, outDir, skuLabel) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ 
    viewport: contextFactory.getDesktopContextOptions().viewport,
    ignoreHTTPSErrors: true,
    recordHar: { path: path.join(outDir, "network.har"), content: "embed" }
  });

  const page = await context.newPage();
  console.log(`[SKUA] Initializing ${skuLabel} capture for ${env}...`);

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  } catch (e) {
    console.error(`[WARN] Navigation: ${e.message}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
  }

  await page.waitForTimeout(2000); 
  await page.screenshot({ path: path.join(outDir, "fullpage.png"), fullPage: true });
  fs.writeFileSync(path.join(outDir, "mirror.html"), await page.content());
  
  const meta = { env, url, sku: skuLabel, timestamp: new Date().toISOString() };
  fs.writeFileSync(path.join(outDir, "capture_meta.json"), JSON.stringify(meta, null, 2));

  await context.close(); // Forces HAR flush
  await browser.close();
}

(async () => {
  const root = process.cwd();
  const triage = JSON.parse(fs.readFileSync("triage_manifest.json", "utf8"));
  const stamp = new Date().getTime();
  const caseRoot = path.join(root, "runs", `matter_${stamp}_SKU_A`);
  const deliverDir = path.join(caseRoot, "Deliverable_Packet", "packets", "desktop");

  fs.mkdirSync(deliverDir, { recursive: true });
  await runCapture("desktop", triage.url, deliverDir, "SKU_A");
  
  console.log(`[OK] SKU A Capture complete: ${caseRoot}`);
})();
