'use strict';

function normalizeToRunUnits(complaintGroups, targetDomain) {
  const runUnits = [];
  let unitIndex  = 0;

  for (const group of complaintGroups) {
    if (!group || !group.anchor || !Array.isArray(group.assertions)) {
      throw new Error('INVALID_COMPLAINT_GROUP: each group must have "anchor" (string) and "assertions" (array).');
    }
    for (const assertion of group.assertions) {
      if (!assertion || typeof assertion !== 'string' || assertion.trim().length === 0) {
        throw new Error('INVALID_ASSERTION: empty assertion in group "' + group.anchor + '".');
      }
      unitIndex++;
      runUnits.push({
        rununitid:            unitIndex,
        complaintgroupanchor: String(group.anchor),
        assertedcondition:    assertion.trim(),
        targetdomain:         targetDomain || null,
        outcome:              null,
        context:              null,
        constraintclass:      null,
        note:                 null,
        mobileanchorbasis:    null,
        tsstart:              null,
        tsend:                null
      });
    }
  }
  return runUnits;
}

function validateAtomicity(runUnits) {
  for (const ru of runUnits) {
    if (!ru.assertedcondition || typeof ru.assertedcondition !== 'string') {
      throw new Error('ATOMICITY_VIOLATION: run unit ' + ru.rununitid + ' missing assertedcondition.');
    }
    if (ru.assertedcondition.includes('\n')) {
      throw new Error('ATOMICITY_VIOLATION: run unit ' + ru.rununitid + ' has multi-line assertedcondition.');
    }
  }
}

module.exports = { normalizeToRunUnits, validateAtomicity };
