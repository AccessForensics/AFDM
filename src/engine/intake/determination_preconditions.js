'use strict';

const { ENUMS, OUTCOME_CONSTRAINED } = require('./locked.js');

// Locked constraint classes (must match canonical enums)
const LOCKED_CONSTRAINT_CLASSES = new Set(Object.values(ENUMS.CONSTRAINT_CLASS || {}));

function assertTemplate3Preconditions(mobileRunUnits) {
  if (!Array.isArray(mobileRunUnits) || mobileRunUnits.length === 0) {
    throw new Error('TEMPLATE3_PRECONDITION: Mobile not in scope or no Mobile run units present');
  }

  const constrainedMobile = mobileRunUnits.find((ru) => {
    if (!ru) return false;
    return (
      ru.outcome_label === OUTCOME_CONSTRAINED &&
      typeof ru.constraintclass === 'string' &&
      LOCKED_CONSTRAINT_CLASSES.has(ru.constraintclass)
    );
  });

  if (!constrainedMobile) {
    throw new Error(
      'TEMPLATE3_PRECONDITION: No Constrained Mobile run unit with valid constraintclass found. ' +
      'Template 3 requires outcome_label=Constrained and constraintclass in locked enum.'
    );
  }
}

module.exports = { assertTemplate3Preconditions };