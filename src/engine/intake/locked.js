'use strict';

const ENUMS = require('../../../engine/intake/enums.js');

// Locked system limits
const RUN_CAP = 10;
const SUFFICIENCY_THRESHOLD = 2;

function getViewport(kind) {
  if (ENUMS.VIEWPORT && ENUMS.VIEWPORT[kind]) return ENUMS.VIEWPORT[kind];
  if (ENUMS.CONTEXTS && ENUMS.CONTEXTS[kind] && ENUMS.CONTEXTS[kind].viewport) return ENUMS.CONTEXTS[kind].viewport;
  throw new Error('CANONICAL_ENUMS_MISSING_VIEWPORT: kind=' + String(kind));
}

function getOutcomeValue(desiredText) {
  const vals = Object.values(ENUMS.OUTCOME || {});
  const found = vals.find(v => v === desiredText);
  if (!found) throw new Error('CANONICAL_ENUMS_MISSING_OUTCOME_VALUE: ' + desiredText);
  return found;
}

const OUTCOME_OBSERVED = getOutcomeValue('Observed as asserted');
const OUTCOME_NOTOBSERVED = getOutcomeValue('Not observed as asserted');
const OUTCOME_CONSTRAINED = getOutcomeValue('Constrained');
const OUTCOME_INSUFFICIENT = getOutcomeValue('Insufficiently specified for bounded execution');

// Qualifying set must include NOT OBSERVED
const QUALIFYING_SET = new Set([OUTCOME_OBSERVED, OUTCOME_NOTOBSERVED]);

function validateOutcome(label) {
  const allowed = new Set(Object.values(ENUMS.OUTCOME || {}));
  if (!allowed.has(label)) throw new Error('INVALID_OUTCOME_LABEL: ' + String(label));
  return label;
}

function validateConstraintClass(cls) {
  if (cls === null || cls === undefined || cls === '') return null;
  const allowed = new Set(Object.values(ENUMS.CONSTRAINT_CLASS || {}));
  if (!allowed.has(cls)) throw new Error('INVALID_CONSTRAINT_CLASS: ' + String(cls));
  return cls;
}

module.exports = {
  ENUMS,
  RUN_CAP,
  SUFFICIENCY_THRESHOLD,
  QUALIFYING_SET,
  validateOutcome,
  validateConstraintClass,
  getViewport,
  OUTCOME_OBSERVED,
  OUTCOME_NOTOBSERVED,
  OUTCOME_CONSTRAINED,
  OUTCOME_INSUFFICIENT
};