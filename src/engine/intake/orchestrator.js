'use strict';
const { chromium, webkit } = require('playwright');
const path = require('path');
const fs   = require('fs');

const { ENUMS, QUALIFYING_SET, RUN_CAP, SUFFICIENCY_THRESHOLD, validateOutcome, validateConstraintClass } = require('./locked.js');
const { validateNote }                           = require('./notegate.js');
const { normalizeToRunUnits, validateAtomicity } = require('./complaintnormalizer.js');
const { computeDetermination }                   = require('./determination.js');
const contextFactory                             = require('./contextfactory.js');
const { detectAnchor }                           = require('./anchordetector.js');

async function executeIntake(config) {
  const {
    targetUrl,
    targetDomain,
    complaintGroups,
    runUnitsInput,
    complaintMaterials,
    outputDir,
    runExecutor
  } = config;

  if (!outputDir)   throw new Error('INTAKE_CONFIG: outputDir is required.');
  if (!runExecutor) throw new Error('INTAKE_CONFIG: runExecutor function is required.');
  fs.mkdirSync(outputDir, { recursive: true });

  let allRunUnits;
  if (runUnitsInput && Array.isArray(runUnitsInput)) {
    allRunUnits = runUnitsInput.map((u, idx) => ({
      rununitid:            idx + 1,
      complaintgroupanchor: String(u.anchor   || 'Unknown anchor'),
      assertedcondition:    String(u.condition || u.assertedcondition || '').trim(),
      targetdomain:         targetDomain || null,
      outcome:              null,
      context:              null,
      constraintclass:      null,
      note:                 null,
      mobileanchorbasis:    null,
      tsstart:              null,
      tsend:                null
    }));
  } else if (complaintGroups && Array.isArray(complaintGroups)) {
    allRunUnits = normalizeToRunUnits(complaintGroups, targetDomain);
  } else {
    throw new Error('INTAKE_CONFIG: either runUnitsInput or complaintGroups must be provided.');
  }
  validateAtomicity(allRunUnits);

  const anchorResult       = detectAnchor(String(complaintMaterials || ''));
  const mobileInScope      = anchorResult.mobileInScope;
  const mobileAnchorPhrase = anchorResult.anchorPhrase;

  const desktopQueue = [];
  const mobileQueue  = [];

  for (const ru of allRunUnits) {
    if (desktopQueue.length + mobileQueue.length >= RUN_CAP) break;

    desktopQueue.push({ ...ru, context: 'desktop' });

    if (mobileInScope) {
      const unitAnchor = detectAnchor(ru.assertedcondition);
      if (unitAnchor.mobileInScope) {
        mobileQueue.push({
          ...ru,
          rununitid:        ru.rununitid + 0.5,
          context:          'mobile',
          mobileanchorbasis: {
            sourcereference: ru.complaintgroupanchor,
            anchoringphrase: mobileAnchorPhrase
          }
        });
      } else {
        mobileQueue.push({
          ...ru,
          rununitid:        ru.rununitid + 0.5,
          context:          'mobile',
          outcome:          'Insufficiently specified for bounded execution',
          note:             'Mobile context assertion does not meet specificity threshold.',
          mobileanchorbasis: null,
          skipped:          true
        });
      }
    }
  }

  const interleavedSchedule = [];
  const maxLen = Math.max(desktopQueue.length, mobileInScope ? mobileQueue.length : 0);
  for (let i = 0; i < maxLen; i++) {
    if (i < desktopQueue.length)                 interleavedSchedule.push(desktopQueue[i]);
    if (mobileInScope && i < mobileQueue.length) interleavedSchedule.push(mobileQueue[i]);
  }
  const finalSchedule = interleavedSchedule.slice(0, RUN_CAP);

  let qualifyingConfirmations = 0;
  const completedRuns         = [];
  let browser                 = null;

  try {
    for (let i = 0; i < finalSchedule.length; i++) {
      const run = finalSchedule[i];

      if (qualifyingConfirmations >= SUFFICIENCY_THRESHOLD) break;

      run.tsstart = new Date().toISOString();

      if (run.skipped) {
        run.tsend = new Date().toISOString();
        completedRuns.push(run);
        continue;
      }

      if (browser) { try { await browser.close(); } catch (_) {} browser = null; }

      const isMobile    = (run.context === 'mobile');
      const browserType = isMobile ? webkit : chromium;
      browser = await browserType.launch({ headless: true });

      const ctxOpts = isMobile
        ? { ...contextFactory.getMobileContextOptions(),  ignoreHTTPSErrors: true }
        : { ...contextFactory.getDesktopContextOptions(), ignoreHTTPSErrors: true };
      const ctx = await browser.newContext(ctxOpts);

      try {
        const outcomeLabel = await runExecutor(browser, ctx, run, targetUrl);
        validateOutcome(outcomeLabel);
        run.outcome = outcomeLabel;

        if (QUALIFYING_SET.has(outcomeLabel)) qualifyingConfirmations++;

        if (outcomeLabel === 'Constrained') {
          const validCls = validateConstraintClass(run.constraintclass);
          if (validCls === null) {
            run.outcome         = 'Insufficiently specified for bounded execution';
            run.note            = 'Blocking condition does not map to a locked constraint class.';
            run.constraintclass = null;
          }
        }

        const noteResult = validateNote(run.outcome, run.note, false);
        if (!noteResult.valid) throw new Error('NOTE_GATE_VIOLATION: ' + noteResult.reason);
        run.note = noteResult.sanitized;

        if (QUALIFYING_SET.has(run.outcome) && run.note) {
          throw new Error('NOTE_PROHIBITED: notes not allowed for outcome "' + run.outcome + '"');
        }

      } finally {
        try { await ctx.close(); } catch (_) {}
      }

      run.tsend = new Date().toISOString();
      completedRuns.push(run);
    }
  } finally {
    if (browser) { try { await browser.close(); } catch (_) {} }
  }

  const determination = computeDetermination(
    completedRuns,
    mobileInScope,
    'Mobile context was not in scope per explicit anchor rule.'
  );

  const internalResult = {
    targetdomain:            targetDomain,
    targeturl:               targetUrl,
    determination:           determination.category,
    determinationnote:       determination.note,
    mobileinscope:           mobileInScope,
    mobileanchorphrase:      mobileAnchorPhrase,
    totalrunsexecuted:       completedRuns.length,
    qualifyingconfirmations: qualifyingConfirmations,
    sufficiencyreached:      qualifyingConfirmations >= SUFFICIENCY_THRESHOLD,
    runcap:                  RUN_CAP,
    runs:                    completedRuns,
    generatedutc:            new Date().toISOString()
  };
  fs.writeFileSync(
    path.join(outputDir, 'intakeresult-internal.json'),
    JSON.stringify(internalResult, null, 2) + '\n', 'utf8'
  );

  const externalResult = {
    targetdomain:      targetDomain,
    determination:     determination.category,
    determinationnote: determination.note,
    generatedutc:      new Date().toISOString()
  };
  fs.writeFileSync(
    path.join(outputDir, 'intakeresult-external.json'),
    JSON.stringify(externalResult, null, 2) + '\n', 'utf8'
  );

  return { internal: internalResult, external: externalResult };
}

module.exports = { executeIntake };
