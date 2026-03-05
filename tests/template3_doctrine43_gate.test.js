"use strict";

const { assertTemplate3Preconditions } = require("../src/engine/intake/assert_template3_preconditions.js");

function mkSet() {
  return new Set(["BOTMITIGATION","AUTHWALL","GEOBLOCK","HARDCRASH","NAVIMPEDIMENT"]);
}

function mkRuns(opts) {
  // opts: { mobileOutcome, cc, loaded }
  return [
    { context: "desktop", run_sequence: 1, outcome: "Observed" },
    { context: "mobile",  run_sequence: 2, outcome: opts.mobileOutcome, constraintclass: opts.cc, mobile_baseline_top_document_loaded: opts.loaded }
  ];
}

test("Template 3 permitted only when first Mobile is Constrained, qualifying cc, baseline_loaded=false", () => {
  const runs = mkRuns({ mobileOutcome: "Constrained", cc: "BOTMITIGATION", loaded: false });
  expect(assertTemplate3Preconditions(true, runs, mkSet())).toBe(true);
});

test("Template 3 prohibited when first Mobile constraintclass is NAVIMPEDIMENT", () => {
  const runs = mkRuns({ mobileOutcome: "Constrained", cc: "NAVIMPEDIMENT", loaded: false });
  expect(() => assertTemplate3Preconditions(true, runs, mkSet())).toThrow(/NAVIMPEDIMENT/);
});

test("Template 3 prohibited when first Mobile baseline_loaded=true", () => {
  const runs = mkRuns({ mobileOutcome: "Constrained", cc: "AUTHWALL", loaded: true });
  expect(() => assertTemplate3Preconditions(true, runs, mkSet())).toThrow(/baseline/);
});

test("Template 3 prohibited when first Mobile is not Constrained", () => {
  const runs = mkRuns({ mobileOutcome: "Observed", cc: "AUTHWALL", loaded: false });
  expect(() => assertTemplate3Preconditions(true, runs, mkSet())).toThrow(/not Constrained/);
});

test("Template 3 prohibited when run_sequence ordering is wrong", () => {
  const runs = [
    { context: "desktop", run_sequence: 2, outcome: "Observed" },
    { context: "mobile",  run_sequence: 1, outcome: "Constrained", constraintclass: "AUTHWALL", mobile_baseline_top_document_loaded: false }
  ];
  expect(() => assertTemplate3Preconditions(true, runs, mkSet())).toThrow(/run_sequence/);
});
