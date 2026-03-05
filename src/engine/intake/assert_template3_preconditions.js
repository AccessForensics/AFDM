"use strict";

/**
 * Doctrine 4.3 [LOCKED] Template 3 gate.
 *
 * Template 3 permitted ONLY when ALL are true:
 * - Mobile is in scope under explicit anchor rule
 * - FIRST Mobile RUNUNIT (run_sequence=2) is Constrained
 * - constraintclass in { BOTMITIGATION, AUTHWALL, GEOBLOCK, HARDCRASH } (NAVIMPEDIMENT never qualifies)
 * - mobile_baseline_top_document_loaded === false for that first Mobile RUNUNIT
 * - Later Mobile constraints never enable Template 3 once a stable top-level document exists
 */

const QUALIFYING = new Set(["BOTMITIGATION", "AUTHWALL", "GEOBLOCK", "HARDCRASH"]);

function assertTemplate3Preconditions(mobileInScope, completedRuns, lockedConstraintClasses) {
  if (!mobileInScope) {
    throw new Error("TEMPLATE3_PRECONDITION: Mobile not in scope under explicit anchor rule");
  }
  if (!Array.isArray(completedRuns) || completedRuns.length === 0) {
    throw new Error("TEMPLATE3_PRECONDITION: No completed runs present");
  }
  if (!(lockedConstraintClasses instanceof Set) || lockedConstraintClasses.size === 0) {
    throw new Error("TEMPLATE3_PRECONDITION: Locked constraint enum set missing");
  }

  // Invariant: run_sequence exists, starts at 1, strictly increasing (across all rununits recorded)
  const seqs = completedRuns.map(r => r && r.run_sequence).filter(v => v !== undefined && v !== null);
  if (seqs.length !== completedRuns.length) {
    throw new Error("TEMPLATE3_PRECONDITION: run_sequence missing on one or more run units");
  }
  const sorted = [...seqs].sort((a,b) => a - b);
  if (sorted[0] !== 1) {
    throw new Error("TEMPLATE3_PRECONDITION: run_sequence must start at 1");
  }
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) {
      throw new Error("TEMPLATE3_PRECONDITION: run_sequence must be strictly increasing by 1");
    }
  }

  // Invariant: when Mobile is in scope, run_sequence 1 is Desktop and 2 is Mobile
  const ru1 = completedRuns.find(r => r.run_sequence === 1);
  const ru2 = completedRuns.find(r => r.run_sequence === 2);
  if (!ru1 || !ru2) {
    throw new Error("TEMPLATE3_PRECONDITION: Missing run_sequence 1 or 2 required for Desktop then Mobile");
  }
  if (String(ru1.context).toLowerCase() !== "desktop") {
    throw new Error("TEMPLATE3_PRECONDITION: When Mobile in scope, run_sequence 1 must be Desktop");
  }
  if (String(ru2.context).toLowerCase() !== "mobile") {
    throw new Error("TEMPLATE3_PRECONDITION: When Mobile in scope, run_sequence 2 must be Mobile");
  }

  // The FIRST Mobile RUNUNIT is deterministically run_sequence === 2
  const firstMobile = ru2;

  const outcome = firstMobile.outcome_label ?? firstMobile.outcome;
  if (String(outcome) !== "Constrained") {
    throw new Error("TEMPLATE3_PRECONDITION: First Mobile RUNUNIT is not Constrained");
  }

  const cc = firstMobile.constraintclass;
  if (typeof cc !== "string" || cc.trim() === "") {
    throw new Error("TEMPLATE3_PRECONDITION: First Mobile RUNUNIT missing constraintclass");
  }
  if (!lockedConstraintClasses.has(cc)) {
    throw new Error("TEMPLATE3_PRECONDITION: First Mobile RUNUNIT constraintclass not in locked enum");
  }
  if (cc === "NAVIMPEDIMENT") {
    throw new Error("TEMPLATE3_PRECONDITION: NAVIMPEDIMENT does not qualify for Template 3");
  }
  if (!QUALIFYING.has(cc)) {
    throw new Error("TEMPLATE3_PRECONDITION: constraintclass not qualifying for Template 3");
  }

  if (typeof firstMobile.mobile_baseline_top_document_loaded !== "boolean") {
    throw new Error("TEMPLATE3_PRECONDITION: mobile_baseline_top_document_loaded missing for first Mobile RUNUNIT");
  }
  if (firstMobile.mobile_baseline_top_document_loaded === true) {
    throw new Error("TEMPLATE3_PRECONDITION: First Mobile RUNUNIT established a stable top-level document, Template 3 prohibited");
  }

  return true;
}

module.exports = { assertTemplate3Preconditions };
