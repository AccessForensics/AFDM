'use strict';

function assertTemplate3Preconditions(mobileInScope, completedRuns, lockedConstraintClasses) {
  if (!mobileInScope) {
    throw new Error('TEMPLATE3_PRECONDITION: Mobile not in scope under explicit anchor rule');
  }
  if (!Array.isArray(completedRuns) || completedRuns.length === 0) {
    throw new Error('TEMPLATE3_PRECONDITION: No completed runs present');
  }
  if (!(lockedConstraintClasses instanceof Set) || lockedConstraintClasses.size === 0) {
    throw new Error('TEMPLATE3_PRECONDITION: Locked constraint enum set missing');
  }

  const mobileRuns = completedRuns.filter(r => r && r.context === 'mobile' && !r.skipped);

  if (mobileRuns.length === 0) {
    throw new Error('TEMPLATE3_PRECONDITION: Mobile in scope but no Mobile run units present');
  }

  const constrainedMobile = mobileRuns.find(r => {
    return r.outcome === 'Constrained'
      && typeof r.constraintclass === 'string'
      && lockedConstraintClasses.has(r.constraintclass);
  });

  if (!constrainedMobile) {
    throw new Error(
      'TEMPLATE3_PRECONDITION: No Constrained Mobile run unit with valid constraintclass found. ' +
      'Template 3 requires outcome=Constrained and constraintclass in locked enum.'
    );
  }

  return true;
}

module.exports = { assertTemplate3Preconditions };