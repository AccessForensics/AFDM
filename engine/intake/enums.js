"use strict";

/**
 * LOCKED TAXONOMY (AF1–10)
 * Outcome labels: 4 only
 * constraint_class values: 5 only
 * Viewport baselines: 1366×900 desktop, 393×852 mobile
 * Determination templates: 6 only (external outputs)
 */
module.exports = Object.freeze({
  OUTCOME: Object.freeze({
    OBSERVED: "Observed as asserted",
    NOT_OBSERVED: "Not observed as asserted",
    CONSTRAINED: "Constrained",
    INSUFFICIENT: "Insufficiently specified for bounded execution"
  }),

  CONSTRAINT_CLASS: Object.freeze({
    AUTHWALL: "AUTHWALL",
    BOTMITIGATION: "BOTMITIGATION",
    GEOBLOCK: "GEOBLOCK",
    HARDCRASH: "HARDCRASH",
    NAVIMPEDIMENT: "NAVIMPEDIMENT"
  }),

  VIEWPORT: Object.freeze({
    DESKTOP: Object.freeze({ width: 1366, height: 900 }),
    MOBILE: Object.freeze({ width: 393, height: 852 })
  }),

  DETERMINATION_TEMPLATE: Object.freeze({
    T1_DUAL:
      "DETERMINATION: ELIGIBLE FOR DESKTOP AND MOBILE TECHNICAL RECORD BUILD",
    T2_DESKTOP:
      "DETERMINATION: ELIGIBLE FOR DESKTOP TECHNICAL RECORD BUILD",
    T3_DESKTOP_MOBILE_CONSTRAINED:
      "DETERMINATION: ELIGIBLE FOR DESKTOP TECHNICAL RECORD BUILD / MOBILE BASELINE: CONSTRAINED",
    T4_NOT_ELIGIBLE:
      "DETERMINATION: NOT ELIGIBLE FOR FORENSIC EXECUTION",
    T5_NOT_ELIGIBLE_CONSTRAINTS_BOTMITIGATION:
      "DETERMINATION: NOT ELIGIBLE FOR FORENSIC EXECUTION - CONSTRAINTS (BOTMITIGATION)",
    T6_NOT_ELIGIBLE_CONSTRAINTS_OTHER:
      "DETERMINATION: NOT ELIGIBLE FOR FORENSIC EXECUTION - CONSTRAINTS (OTHER)"
  })
});