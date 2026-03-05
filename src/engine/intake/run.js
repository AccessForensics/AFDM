'use strict';

const { assertContextIntegrity } = require('./assert_context_integrity.js');
const fs   = require('fs');
const path = require('path');
const { executeIntake } = require('./orchestrator.js');

const { getDomain } = require('tldts');

async function main() {
  const outDir    = path.join(process.cwd(), '_intake_out');
  const runUnits  = JSON.parse(fs.readFileSync(path.join(outDir, 'rununits.json'),  'utf8'));
  const complaint = fs.readFileSync(path.join(outDir, 'complaint.txt'),             'utf8');

  async function runExecutor(browser, ctx, run, url) {
    const page = await ctx.newPage();
  if (!expectedContext) { throw new Error('CONTEXT_INTEGRITY: expectedContext missing'); }
  await assertContextIntegrity(page, expectedContext);
    await page.goto(url, { waitUntil: 'networkidle' });
    // TODO: replace with real selector checks — return one of:
    //   'Observed as asserted'
    //   'Not observed as asserted'
    /**
 * Doctrine 4.3 [LOCKED]
 * mobile_baseline_top_document_loaded is true IFF:
 *  - page.goto to asserted origin resolves without throwing
 *  - stable top level document exists, document.location.origin readable and non-empty
 *  - resolved origin matches asserted OR is accepted redirect endpoint within same eTLD+1
 * false if ANY failure above
 *
 * Note: bot/auth interstitial that still yields a readable document sets this TRUE (path-specific),
 * because the top-level document exists and origin is readable.
 */
async function __computeMobileBaselineTopDocumentLoaded(page, assertedOrigin, navSucceeded) {
  try {
    if (!navSucceeded) return false;

    // Must have readable, non-empty document.location.origin
    const resolvedOrigin = await page.evaluate(() => {
      try {
        return (document && document.location && document.location.origin) ? String(document.location.origin) : "";
      } catch (e) {
        return "";
      }
    });

    if (!resolvedOrigin || resolvedOrigin.trim() === "") return false;

    // Must match asserted origin exactly OR same registrable domain (same eTLD+1)
    const asserted = new URL(assertedOrigin);
    const resolved = new URL(resolvedOrigin);

    if (resolved.origin === asserted.origin) return true;

    const aDom = getDomain(asserted.hostname);
    const rDom = getDomain(resolved.hostname);

    if (!aDom || !rDom) return false;
    if (aDom !== rDom) return false;

    return true;
  } catch (e) {
    return false;
  }
}
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

