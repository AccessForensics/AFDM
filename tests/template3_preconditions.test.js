'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { assertTemplate3Preconditions } = require('../src/engine/intake/assert_template3_preconditions.js');

function mkSet() {
  return new Set(['AUTHWALL', 'BOTMITIGATION', 'GEOBLOCK', 'HARDCRASH', 'NAVIMPEDIMENT']);
}

test('Template 3 emits when all preconditions satisfied', () => {
  const mobileInScope = true;
  const completedRuns = [
    { context: 'desktop', outcome: 'Observed as asserted' },
    { context: 'mobile', outcome: 'Constrained', constraintclass: 'BOTMITIGATION', skipped: false }
  ];
  assert.equal(assertTemplate3Preconditions(mobileInScope, completedRuns, mkSet()), true);
});

test('Template 3 throws when Mobile run exists but outcome is not Constrained', () => {
  const mobileInScope = true;
  const completedRuns = [
    { context: 'mobile', outcome: 'Not observed as asserted', skipped: false }
  ];
  assert.throws(
    () => assertTemplate3Preconditions(mobileInScope, completedRuns, mkSet()),
    /No Constrained Mobile run unit/
  );
});

test('Template 3 throws when Mobile run is Constrained but constraintclass missing or invalid', () => {
  const mobileInScope = true;
  const completedRunsA = [
    { context: 'mobile', outcome: 'Constrained', skipped: false }
  ];
  assert.throws(
    () => assertTemplate3Preconditions(mobileInScope, completedRunsA, mkSet()),
    /valid constraintclass/
  );

  const completedRunsB = [
    { context: 'mobile', outcome: 'Constrained', constraintclass: 'NOT_A_REAL_CLASS', skipped: false }
  ];
  assert.throws(
    () => assertTemplate3Preconditions(mobileInScope, completedRunsB, mkSet()),
    /valid constraintclass/
  );
});