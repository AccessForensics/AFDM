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
