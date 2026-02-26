"use strict";

const {
  ENUMS,
  QUALIFYING_SET,
  OUTCOME_CONSTRAINED,
  SUFFICIENCY_THRESHOLD
} = require("./locked.js");

function getConstraintClass(ru) {
  if (!ru) return null;
  return ru.constraintclass || ru.constraintClass || ru.constraint_class || ru.constraint || null;
}

function summarizeByContext(runUnits) {
  const acc = {
    DESKTOP: { qualifying: 0, constrained: 0, total: 0 },
    MOBILE:  { qualifying: 0, constrained: 0, total: 0 }
  };

  for (const ru of runUnits || []) {
    const ctx    = (ru && ru.context) ? String(ru.context).toUpperCase() : "DESKTOP";
    const bucket = (ctx === "MOBILE") ? acc.MOBILE : acc.DESKTOP;
    bucket.total += 1;
    if (QUALIFYING_SET.has(ru.outcome))       bucket.qualifying  += 1;
    if (ru.outcome === OUTCOME_CONSTRAINED)   bucket.constrained += 1;
  }

  return acc;
}

function pickConstraintsTemplate(runUnits) {
  const isBot = (runUnits || []).some(ru =>
    ru &&
    ru.outcome === OUTCOME_CONSTRAINED &&
    String(getConstraintClass(ru)).toUpperCase() === "BOTMITIGATION"
  );

  const dt = ENUMS.DETERMINATION_TEMPLATE || {};

  if (isBot) {
    return dt.T5_NOT_ELIGIBLE_CONSTRAINTS_BOTMITIGATION
        || dt.T5_NOT_ELIGIBLE_CONSTRAINTS
        || dt.T5_CONSTRAINTS;
  }

  return dt.T6_NOT_ELIGIBLE_CONSTRAINTS_OTHER
      || dt.T6_NOT_ELIGIBLE_CONSTRAINTS
      || dt.T6_CONSTRAINTS
      || dt.T5_NOT_ELIGIBLE_CONSTRAINTS_OTHER;
}

// Routes to locked external template headers only. No paraphrase permitted.
function computeDetermination(runUnits, mobileInScope) {
  const s = summarizeByContext(runUnits);

  const desktopQualified  = s.DESKTOP.qualifying >= SUFFICIENCY_THRESHOLD;
  const mobileQualified   = mobileInScope && (s.MOBILE.qualifying >= SUFFICIENCY_THRESHOLD);
  const mobileConstrained = mobileInScope && (s.MOBILE.constrained > 0);
  const anyConstrained    = (s.DESKTOP.constrained + s.MOBILE.constrained) > 0;

  if (desktopQualified && mobileQualified) {
    return { category: ENUMS.DETERMINATION_TEMPLATE.T1_DUAL, note: null };
  }

  if (desktopQualified && mobileInScope && mobileConstrained) {
    return { category: ENUMS.DETERMINATION_TEMPLATE.T3_DESKTOP_MOBILE_CONSTRAINED, note: null };
  }

  if (desktopQualified) {
    return { category: ENUMS.DETERMINATION_TEMPLATE.T2_DESKTOP, note: null };
  }

  if (anyConstrained) {
    const t = pickConstraintsTemplate(runUnits);
    if (!t) throw new Error("CANONICAL_ENUMS_MISSING_CONSTRAINTS_TEMPLATE");
    return { category: t, note: null };
  }

  return { category: ENUMS.DETERMINATION_TEMPLATE.T4_NOT_ELIGIBLE, note: null };
}

module.exports = { computeDetermination };