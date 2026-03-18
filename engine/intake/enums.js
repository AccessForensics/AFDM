"use strict";

const OUTCOME = Object.freeze({
  OBSERVED: "Observed as asserted",
  NOT_OBSERVED: "Not observed as asserted",
  CONSTRAINED: "Constrained",
  INSUFFICIENT: "Insufficiently specified for bounded execution",
});

const CONSTRAINT_CLASS = Object.freeze({
  AUTHWALL: "AUTHWALL",
  BOTMITIGATION: "BOTMITIGATION",
  GEOBLOCK: "GEOBLOCK",
  HARDCRASH: "HARDCRASH",
  NAVIMPEDIMENT: "NAVIMPEDIMENT",
});

const VIEWPORT = Object.freeze({
  DESKTOP: Object.freeze({ width: 1366, height: 900 }),
  MOBILE: Object.freeze({ width: 393, height: 852 }),
});

const DETERMINATION_TEMPLATE = Object.freeze({
  T1_DUAL: "DETERMINATION: ELIGIBLE FOR DESKTOP AND MOBILE TECHNICAL RECORD BUILD",
  T2_DESKTOP: "DETERMINATION: ELIGIBLE FOR DESKTOP TECHNICAL RECORD BUILD",
  T3_DESKTOP_MOBILE_CONSTRAINED: "DETERMINATION: ELIGIBLE FOR DESKTOP TECHNICAL RECORD BUILD / MOBILE BASELINE: CONSTRAINED",
  T4_MOBILE: "DETERMINATION: ELIGIBLE FOR MOBILE TECHNICAL RECORD BUILD",
  T5_MOBILE_DESKTOP_CONSTRAINED: "DETERMINATION: ELIGIBLE FOR MOBILE TECHNICAL RECORD BUILD / DESKTOP BASELINE: CONSTRAINED",
  T6_NOT_ELIGIBLE: "DETERMINATION: NOT ELIGIBLE FOR FORENSIC EXECUTION",
  T7_NOT_ELIGIBLE_CONSTRAINTS_BOTMITIGATION: "DETERMINATION: NOT ELIGIBLE FOR FORENSIC EXECUTION - CONSTRAINTS (BOTMITIGATION)",
  T8_NOT_ELIGIBLE_CONSTRAINTS_OTHER: "DETERMINATION: NOT ELIGIBLE FOR FORENSIC EXECUTION - CONSTRAINTS (OTHER)",
});

const CREATED_CONTEXT_BASIS = Object.freeze({
  GENERIC_ACCESSIBILITY_ALLEGATION: "generic_accessibility_allegation",
  MATERIALS_CABINED_DESKTOP_ONLY: "materials_cabined_desktop_only",
  MATERIALS_CABINED_MOBILE_ONLY: "materials_cabined_mobile_only",
  CONSTRAINED_PEER_BASELINE: "constrained_peer_baseline",
});

const NOTE_BASIS = Object.freeze({
  OUTCOME_CONSTRAINED: "outcome_constrained",
  OUTCOME_INSUFFICIENTLY_SPECIFIED: "outcome_insufficiently_specified",
  DETERMINATION_DESKTOP_ELIGIBLE_MOBILE_CONSTRAINED: "determination_desktop_eligible_mobile_constrained",
  DETERMINATION_MOBILE_ELIGIBLE_DESKTOP_CONSTRAINED: "determination_mobile_eligible_desktop_constrained",
});

const RUN_CAP = 10;
const SUFFICIENCY_THRESHOLD = 2;
const TEMPLATE_VALUES = Object.freeze(Object.values(DETERMINATION_TEMPLATE));
const OUTCOME_VALUES = Object.freeze(Object.values(OUTCOME));
const CONSTRAINT_CLASS_VALUES = Object.freeze(Object.values(CONSTRAINT_CLASS));
const BANNED_WORDS = Object.freeze([
  "pass",
  "fail",
  "compliant",
  "non-compliant",
  "violation",
  "audit",
  "remediation",
  "certification",
  "guarantee",
  "extensive testing",
  "limited testing",
  "we checked everything",
  "we checked only a few items",
]);

function validateOutcome(value) {
  if (!OUTCOME_VALUES.includes(value)) {
    throw new Error(`INVALID_OUTCOME: ${value}`);
  }
  return value;
}

function validateConstraintClass(value) {
  if (value === "" || value == null) {
    return "";
  }
  if (!CONSTRAINT_CLASS_VALUES.includes(value)) {
    throw new Error(`INVALID_CONSTRAINT_CLASS: ${value}`);
  }
  return value;
}

module.exports = Object.freeze({
  OUTCOME,
  CONSTRAINT_CLASS,
  VIEWPORT,
  DETERMINATION_TEMPLATE,
  CREATED_CONTEXT_BASIS,
  NOTE_BASIS,
  RUN_CAP,
  SUFFICIENCY_THRESHOLD,
  TEMPLATE_VALUES,
  OUTCOME_VALUES,
  CONSTRAINT_CLASS_VALUES,
  BANNED_WORDS,
  validateOutcome,
  validateConstraintClass,
});