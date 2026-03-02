'use strict';

const { assertTemplate3Preconditions } = require('./determination_preconditions.js');

const { QUALIFYING_SET } = require('./enums.js');

function computeDetermination(runUnits, mobileInScope, mobileBarrierNote) {
  const qualifyingCount  = runUnits.filter(ru => QUALIFYING_SET.has(ru.outcome)).length;
  const constrainedCount = runUnits.filter(ru => ru.outcome === 'Constrained').length;

  if (qualifyingCount === 0) {
    if (constrainedCount > 0) {
      return { category: 'Not eligible for forensic verification - constraints', note: null };
    }
    return { category: 'Not eligible for forensic verification', note: null };
  }

  if (mobileInScope) {
    return { category: 'Eligible for Desktop and Mobile browser forensic verification', note: null };
  }

  return {
    category: 'Eligible for Desktop browser forensic verification',
    note:     mobileBarrierNote || 'Mobile context was not in scope per explicit anchor rule.'
  };
}

module.exports = { computeDetermination };
