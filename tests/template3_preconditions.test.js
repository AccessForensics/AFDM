'use strict';

const { assertTemplate3Preconditions } = require('../src/engine/intake/assert_template3_preconditions.js');

function mkSet() {
  return new Set(['AUTHWALL', 'BOTMITIGATION', 'GEOBLOCK', 'HARDCRASH', 'NAVIMPEDIMENT']);
}

test('Template 3 emits when all preconditions satisfied', () => {
  const mobileInScope = true;
  const completedRuns = [
    { context: 'desktop', run_sequence: 1, outcome: 'Observed' },
    { context: 'mobile', run_sequence: 2, outcome: 'Constrained', constraintclass: 'BOTMITIGATION', mobile_baseline_top_document_loaded: false }
  ];
  expect(assertTemplate3Preconditions(mobileInScope, completedRuns, mkSet())).toBe(true);
});

test('Template 3 throws when Mobile run exists but outcome is not Constrained', () => {
  const mobileInScope = true;
  const completedRuns = [
    { context: 'desktop', run_sequence: 1, outcome: 'Observed' },
    { context: 'mobile', run_sequence: 2, outcome: 'Not observed as asserted', mobile_baseline_top_document_loaded: false }
  ];
  expect(
    () => assertTemplate3Preconditions(mobileInScope, completedRuns, mkSet())
  ).toThrow(/First Mobile RUNUNIT is not Constrained/);
});

test('Template 3 throws when Mobile run is Constrained but constraintclass missing or invalid', () => {
  const mobileInScope = true;
  const completedRunsA = [
    { context: 'desktop', run_sequence: 1, outcome: 'Observed' },
    { context: 'mobile', run_sequence: 2, outcome: 'Constrained', mobile_baseline_top_document_loaded: false }
  ];
  expect(
    () => assertTemplate3Preconditions(mobileInScope, completedRunsA, mkSet())
  ).toThrow(/First Mobile RUNUNIT missing constraintclass/);

  const completedRunsB = [
    { context: 'desktop', run_sequence: 1, outcome: 'Observed' },
    { context: 'mobile', run_sequence: 2, outcome: 'Constrained', constraintclass: 'NOT_A_REAL_CLASS', mobile_baseline_top_document_loaded: false }
  ];
  expect(
    () => assertTemplate3Preconditions(mobileInScope, completedRunsB, mkSet())
  ).toThrow(/First Mobile RUNUNIT constraintclass not in locked enum/);
});