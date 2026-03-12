'use strict';

const fs = require('fs');
const path = require('path');
const { ENUMS } = require('./locked.js');

/**
 * AFIntakeTemplate.pdf includes canonical text for 4 determination templates only.
 * T3_DESKTOP_MOBILE_CONSTRAINED has no approved template text and must not be synthesized.
 */
function resolveTemplate(category, constraintClass = null, constraintBasis = null) {
  const dt = ENUMS.DETERMINATION_TEMPLATE || {};
  const templatesDir = path.join(__dirname, 'templates');

  if (category === dt.T3_DESKTOP_MOBILE_CONSTRAINED) {
    throw new Error('Missing canonical determination template for T3_DESKTOP_MOBILE_CONSTRAINED. AFIntakeTemplate.pdf provides no approved text for this state. Refusing to synthesize non-canonical determination content.');
  }

  if (category === dt.T1_DUAL) {
    return fs.readFileSync(path.join(templatesDir, 'ELIGIBLE_DESKTOP_MOBILE.md'), 'utf8');
  }

  if (category === dt.T2_DESKTOP) {
    return fs.readFileSync(path.join(templatesDir, 'ELIGIBLE_DESKTOP.md'), 'utf8');
  }

  if (category === dt.T4_NOT_ELIGIBLE) {
    return fs.readFileSync(path.join(templatesDir, 'NOT_ELIGIBLE.md'), 'utf8');
  }

  if (category === dt.T5_NOT_ELIGIBLE_CONSTRAINTS_BOTMITIGATION || category === dt.T6_NOT_ELIGIBLE_CONSTRAINTS_OTHER) {
    let tpl = fs.readFileSync(path.join(templatesDir, 'NOT_ELIGIBLE_CONSTRAINTS.md'), 'utf8');
    tpl = tpl.replace('{{CONSTRAINT_CLASS}}', constraintClass || 'UNKNOWN');
    tpl = tpl.replace('{{CONSTRAINT_BASIS}}', constraintBasis || 'Constraint encountered during baseline navigation');
    return tpl;
  }

  throw new Error(`Unknown determination category for template resolution: ${category}`);
}

module.exports = { resolveTemplate };
