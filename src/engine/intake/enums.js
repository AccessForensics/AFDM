"use strict";

module.exports = Object.freeze({
  OUTCOME: {
    OBSERVED: "Observed as asserted",
    CONSTRAINED: "Constrained",
    INSUFFICIENT: "Insufficiently specified for bounded execution"
  },
  CONSTRAINT: {
    AUTHWALL: "AUTHWALL",
    BOTMITIGATION: "BOTMITIGATION",
    GEOBLOCK: "GEOBLOCK",
    HARDCRASH: "HARDCRASH",
    NAVIMPEDIMENT: "NAVIMPEDIMENT"
  },
  DETERMINATION: {
    DUAL: "Eligible for Desktop and Mobile browser forensic verification",
    DESKTOP: "Eligible for Desktop browser forensic verification",
    INELIGIBLE: "Not eligible for forensic verification",
    CONSTRAINED: "Not eligible for forensic verification - constraints"
  },
  METHODOLOGY: "Baseline viewport parameters were selected for breakpoint tier stability and operator reproducibility, browser zoom is locked at 100% for all baseline captures, reflow is tested separately per WCAG 1.4.10, no parameter selection was derived from device market share or statistical typicality."
});
