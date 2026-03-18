"use strict";

const { DETERMINATION_TEMPLATE, OUTCOME, CONSTRAINT_CLASS } = require("./enums.js");

const QUALIFYING_SET = new Set([OUTCOME.OBSERVED, OUTCOME.NOT_OBSERVED]);

function normalizeScope(scopeOrMobileInScope, runs) {
  if (typeof scopeOrMobileInScope === "boolean") {
    return {
      desktopInScope: true,
      mobileInScope: scopeOrMobileInScope,
    };
  }

  if (scopeOrMobileInScope && typeof scopeOrMobileInScope === "object") {
    return {
      desktopInScope: scopeOrMobileInScope.desktopInScope !== false,
      mobileInScope: scopeOrMobileInScope.mobileInScope === true,
    };
  }

  const hasDesktop = runs.some((run) => String(run.context || "").toLowerCase() === "desktop");
  const hasMobile = runs.some((run) => String(run.context || "").toLowerCase() === "mobile");

  return {
    desktopInScope: hasDesktop || !hasMobile,
    mobileInScope: hasMobile,
  };
}

function countQualifying(runs, context) {
  return runs.filter((run) => String(run.context || "").toLowerCase() === context && QUALIFYING_SET.has(run.outcome)).length;
}

function hasConstrained(runs, context) {
  return runs.some(
    (run) => String(run.context || "").toLowerCase() === context && run.outcome === OUTCOME.CONSTRAINED
  );
}

function resolveMatterLevelNote(template, runs, fallbackNote) {
  const noteAllowed =
    template === DETERMINATION_TEMPLATE.T3_DESKTOP_MOBILE_CONSTRAINED ||
    template === DETERMINATION_TEMPLATE.T5_MOBILE_DESKTOP_CONSTRAINED;

  if (!noteAllowed) {
    return "";
  }

  const constrainedContext =
    template === DETERMINATION_TEMPLATE.T3_DESKTOP_MOBILE_CONSTRAINED ? "mobile" : "desktop";

  const sourceRun = runs.find(
    (run) =>
      String(run.context || "").toLowerCase() === constrainedContext &&
      run.outcome === OUTCOME.CONSTRAINED &&
      typeof run.note === "string" &&
      run.note.trim().length > 0
  );

  const value = sourceRun ? sourceRun.note.trim() : String(fallbackNote || "").trim();
  return value;
}

function computeDetermination(runsInput, scopeOrMobileInScope, fallbackNote) {
  const runs = Array.isArray(runsInput) ? runsInput : [];
  const scope = normalizeScope(scopeOrMobileInScope, runs);
  const qualifyingTotal = runs.filter((run) => QUALIFYING_SET.has(run.outcome)).length;

  if (qualifyingTotal < 2) {
    const constrainedRuns = runs.filter((run) => run.outcome === OUTCOME.CONSTRAINED);
    const hasBotMitigation = constrainedRuns.some((run) => run.constraintclass === CONSTRAINT_CLASS.BOTMITIGATION);

    if (hasBotMitigation) {
      return { category: DETERMINATION_TEMPLATE.T7_NOT_ELIGIBLE_CONSTRAINTS_BOTMITIGATION, note: "" };
    }

    if (constrainedRuns.length > 0) {
      return { category: DETERMINATION_TEMPLATE.T8_NOT_ELIGIBLE_CONSTRAINTS_OTHER, note: "" };
    }

    return { category: DETERMINATION_TEMPLATE.T6_NOT_ELIGIBLE, note: "" };
  }

  const desktopQualifying = countQualifying(runs, "desktop");
  const mobileQualifying = countQualifying(runs, "mobile");
  const desktopConstrained = hasConstrained(runs, "desktop");
  const mobileConstrained = hasConstrained(runs, "mobile");

  let template;

  if (scope.desktopInScope && scope.mobileInScope) {
    if (desktopQualifying > 0 && mobileConstrained && mobileQualifying === 0) {
      template = DETERMINATION_TEMPLATE.T3_DESKTOP_MOBILE_CONSTRAINED;
    } else if (mobileQualifying > 0 && desktopConstrained && desktopQualifying === 0) {
      template = DETERMINATION_TEMPLATE.T5_MOBILE_DESKTOP_CONSTRAINED;
    } else {
      template = DETERMINATION_TEMPLATE.T1_DUAL;
    }
  } else if (scope.desktopInScope) {
    template = DETERMINATION_TEMPLATE.T2_DESKTOP;
  } else if (scope.mobileInScope) {
    template = DETERMINATION_TEMPLATE.T4_MOBILE;
  } else {
    template = DETERMINATION_TEMPLATE.T6_NOT_ELIGIBLE;
  }

  return {
    category: template,
    note: resolveMatterLevelNote(template, runs, fallbackNote),
  };
}

module.exports = { computeDetermination };