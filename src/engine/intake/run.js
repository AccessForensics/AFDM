function assertContextIntegrity(runtimeViewport, runtimeDPR, canonicalViewport) {
  if (!runtimeViewport ||
      runtimeViewport.width  !== canonicalViewport.width ||
      runtimeViewport.height !== canonicalViewport.height) {
    throw new Error(
      "CONTEXT_INTEGRITY_FAILURE: runtime " +
      String(runtimeViewport && runtimeViewport.width) + "x" +
      String(runtimeViewport && runtimeViewport.height) +
      " does not match canonical " +
      String(canonicalViewport.width) + "x" + String(canonicalViewport.height)
    );
  }
  if (runtimeDPR !== 1) {
    throw new Error(
      "DPR_INTEGRITY_FAILURE: devicePixelRatio " + String(runtimeDPR) + " must be 1"
    );
  }
}
'use strict';
const fs   = require('fs');
const path = require('path');
const { executeIntake } = require('./orchestrator.js');

async function main() {
  const outDir    = path.join(process.cwd(), '_intake_out');
  const runUnits  = JSON.parse(fs.readFileSync(path.join(outDir, 'rununits.json'),  'utf8'));
  const complaint = fs.readFileSync(path.join(outDir, 'complaint.txt'),             'utf8');

  async function runExecutor(browser, ctx, run, url) {
    const page = await ctx.newPage();
      const __runtimeViewport = page.viewportSize();
      const __runtimeDPR      = await page.evaluate(() => window.devicePixelRatio);
      const __ctxKind         = (run && run.context && run.context.toUpperCase() === "MOBILE")
                                ? "MOBILE" : "DESKTOP";
      const __canonicalVP     = (ENUMS && ENUMS.VIEWPORT)
                                ? ENUMS.VIEWPORT[__ctxKind]
                                : (ENUMS.CONTEXTS[__ctxKind].viewport);
      assertContextIntegrity(__runtimeViewport, __runtimeDPR, __canonicalVP);
    await page.goto(url, { waitUntil: 'networkidle' });
    // TODO: replace with real selector checks — return one of:
    //   'Observed as asserted'
    //   'Not observed as asserted'
    //   'Constrained'  (also set run.constraintclass to AUTHWALL|BOTMITIGATION|GEOBLOCK|HARDCRASH|NAVIMPEDIMENT)
    //   'Insufficiently specified for bounded execution'
    await page.close();
    return 'Observed as asserted';
  }

  const result = await executeIntake({
    targetUrl:          process.env.TARGET_URL    || 'https://example.com',
    targetDomain:       process.env.TARGET_DOMAIN || 'example.com',
    runUnitsInput:      runUnits,
    complaintMaterials: complaint,
    outputDir:          outDir,
    runExecutor
  });

  console.log('\n── External Eligibility ──────────────────────────');
  console.log(JSON.stringify(result.external, null, 2));
  console.log('\n── Internal Summary ──────────────────────────────');
  console.log('Total runs executed:      ', result.internal.totalrunsexecuted);
  console.log('Qualifying confirmations: ', result.internal.qualifyingconfirmations);
  console.log('Sufficiency reached:      ', result.internal.sufficiencyreached);
  console.log('Mobile in scope:          ', result.internal.mobileinscope);
}

main().catch(err => { console.error('INTAKE_ERROR:', err.message); process.exit(1); });
