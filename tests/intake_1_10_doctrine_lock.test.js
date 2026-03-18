"use strict";

const fs = require("fs");
const path = require("path");
const intakeEnums = require("../src/engine/intake/enums.js");
const contextFactory = require("../src/engine/intake/contextfactory.js");
const { computeDetermination } = require("../src/engine/intake/determination.js");
const {
  assertLockedDeterminationTemplate,
  lintDeterminationOutput,
} = require("../src/engine/intake/lint_determination_output.js");

describe("AF 1-10 old-repo doctrine lock", () => {
  test("AFintaketemplates1-8.md contains the locked note rule above template listings", () => {
    const templatePath = path.join(process.cwd(), "AFintaketemplates1-8.md");
    const body = fs.readFileSync(templatePath, "utf8").replace(/^\uFEFF/, "");
    const noteRuleIndex = body.indexOf("Internal implementation rule, not externally emitted:");
    const templateOneIndex = body.indexOf("## TEMPLATE 1:");
    expect(noteRuleIndex).toBeGreaterThanOrEqual(0);
    expect(templateOneIndex).toBeGreaterThan(noteRuleIndex);
  });

  test("canonical intake enums expose exactly eight locked templates and four outcomes", () => {
    expect(intakeEnums.TEMPLATE_VALUES).toEqual([
      intakeEnums.DETERMINATION_TEMPLATE.T1_DUAL,
      intakeEnums.DETERMINATION_TEMPLATE.T2_DESKTOP,
      intakeEnums.DETERMINATION_TEMPLATE.T3_DESKTOP_MOBILE_CONSTRAINED,
      intakeEnums.DETERMINATION_TEMPLATE.T4_MOBILE,
      intakeEnums.DETERMINATION_TEMPLATE.T5_MOBILE_DESKTOP_CONSTRAINED,
      intakeEnums.DETERMINATION_TEMPLATE.T6_NOT_ELIGIBLE,
      intakeEnums.DETERMINATION_TEMPLATE.T7_NOT_ELIGIBLE_CONSTRAINTS_BOTMITIGATION,
      intakeEnums.DETERMINATION_TEMPLATE.T8_NOT_ELIGIBLE_CONSTRAINTS_OTHER,
    ]);

    expect(intakeEnums.OUTCOME_VALUES).toEqual([
      intakeEnums.OUTCOME.OBSERVED,
      intakeEnums.OUTCOME.NOT_OBSERVED,
      intakeEnums.OUTCOME.CONSTRAINED,
      intakeEnums.OUTCOME.INSUFFICIENT,
    ]);
  });

  test("context factory matches locked desktop and mobile baselines", () => {
    const desktop = contextFactory.getDesktopContextOptions();
    const mobile = contextFactory.getMobileContextOptions();

    expect(desktop.viewport).toEqual({ width: 1366, height: 900 });
    expect(desktop.deviceScaleFactor).toBe(1);
    expect(desktop.isMobile).toBe(false);
    expect(desktop.hasTouch).toBe(false);

    expect(mobile.viewport).toEqual({ width: 393, height: 852 });
    expect(mobile.deviceScaleFactor).toBe(1);
    expect(mobile.isMobile).toBe(true);
    expect(mobile.hasTouch).toBe(true);
  });

  test("determination routing covers all eight templates", () => {
    const dual = computeDetermination(
      [
        { context: "desktop", outcome: intakeEnums.OUTCOME.OBSERVED },
        { context: "mobile", outcome: intakeEnums.OUTCOME.NOT_OBSERVED },
      ],
      { desktopInScope: true, mobileInScope: true }
    );
    expect(dual.category).toBe(intakeEnums.DETERMINATION_TEMPLATE.T1_DUAL);
    expect(dual.note).toBe("");

    const desktopOnly = computeDetermination(
      [
        { context: "desktop", outcome: intakeEnums.OUTCOME.OBSERVED },
        { context: "desktop", outcome: intakeEnums.OUTCOME.NOT_OBSERVED },
      ],
      { desktopInScope: true, mobileInScope: false }
    );
    expect(desktopOnly.category).toBe(intakeEnums.DETERMINATION_TEMPLATE.T2_DESKTOP);

    const desktopWithMobileConstrained = computeDetermination(
      [
        { context: "desktop", outcome: intakeEnums.OUTCOME.OBSERVED },
        { context: "desktop", outcome: intakeEnums.OUTCOME.NOT_OBSERVED },
        {
          context: "mobile",
          outcome: intakeEnums.OUTCOME.CONSTRAINED,
          constraintclass: intakeEnums.CONSTRAINT_CLASS.AUTHWALL,
          note: "AUTHWALL blocked bounded Mobile baseline access."
        },
      ],
      { desktopInScope: true, mobileInScope: true }
    );
    expect(desktopWithMobileConstrained.category).toBe(
      intakeEnums.DETERMINATION_TEMPLATE.T3_DESKTOP_MOBILE_CONSTRAINED
    );
    expect(desktopWithMobileConstrained.note).toBe("AUTHWALL blocked bounded Mobile baseline access.");

    const mobileOnly = computeDetermination(
      [
        { context: "mobile", outcome: intakeEnums.OUTCOME.OBSERVED },
        { context: "mobile", outcome: intakeEnums.OUTCOME.NOT_OBSERVED },
      ],
      { desktopInScope: false, mobileInScope: true }
    );
    expect(mobileOnly.category).toBe(intakeEnums.DETERMINATION_TEMPLATE.T4_MOBILE);

    const mobileWithDesktopConstrained = computeDetermination(
      [
        { context: "mobile", outcome: intakeEnums.OUTCOME.OBSERVED },
        { context: "mobile", outcome: intakeEnums.OUTCOME.NOT_OBSERVED },
        {
          context: "desktop",
          outcome: intakeEnums.OUTCOME.CONSTRAINED,
          constraintclass: intakeEnums.CONSTRAINT_CLASS.GEOBLOCK,
          note: "GEOBLOCK blocked bounded Desktop baseline access."
        },
      ],
      { desktopInScope: true, mobileInScope: true }
    );
    expect(mobileWithDesktopConstrained.category).toBe(
      intakeEnums.DETERMINATION_TEMPLATE.T5_MOBILE_DESKTOP_CONSTRAINED
    );
    expect(mobileWithDesktopConstrained.note).toBe("GEOBLOCK blocked bounded Desktop baseline access.");

    const genericIneligible = computeDetermination([], { desktopInScope: true, mobileInScope: true });
    expect(genericIneligible.category).toBe(intakeEnums.DETERMINATION_TEMPLATE.T6_NOT_ELIGIBLE);

    const botMitigationIneligible = computeDetermination(
      [
        {
          context: "mobile",
          outcome: intakeEnums.OUTCOME.CONSTRAINED,
          constraintclass: intakeEnums.CONSTRAINT_CLASS.BOTMITIGATION,
        },
      ],
      { desktopInScope: true, mobileInScope: true }
    );
    expect(botMitigationIneligible.category).toBe(
      intakeEnums.DETERMINATION_TEMPLATE.T7_NOT_ELIGIBLE_CONSTRAINTS_BOTMITIGATION
    );

    const otherConstraintIneligible = computeDetermination(
      [
        {
          context: "desktop",
          outcome: intakeEnums.OUTCOME.CONSTRAINED,
          constraintclass: intakeEnums.CONSTRAINT_CLASS.AUTHWALL,
        },
      ],
      { desktopInScope: true, mobileInScope: true }
    );
    expect(otherConstraintIneligible.category).toBe(
      intakeEnums.DETERMINATION_TEMPLATE.T8_NOT_ELIGIBLE_CONSTRAINTS_OTHER
    );
  });

  test("determination template validator accepts locked templates only", () => {
    expect(() =>
      assertLockedDeterminationTemplate(intakeEnums.DETERMINATION_TEMPLATE.T1_DUAL)
    ).not.toThrow();

    expect(() =>
      assertLockedDeterminationTemplate("DETERMINATION: ELIGIBLE FOR DESKTOP SCAN")
    ).toThrow(/INVALID_DETERMINATION_TEMPLATE/);
  });

  test("external output lint rejects banned phrasing", () => {
    expect(() =>
      lintDeterminationOutput(
        "DETERMINATION: ELIGIBLE FOR DESKTOP TECHNICAL RECORD BUILD`next steps: extensive testing was completed",
        "MAT-001"
      )
    ).toThrow(/banned phrase detected/);

    expect(() =>
      lintDeterminationOutput(
        intakeEnums.DETERMINATION_TEMPLATE.T2_DESKTOP,
        "MAT-002"
      )
    ).not.toThrow();
  });
});