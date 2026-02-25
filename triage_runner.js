"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const ENUMS = require("./src/engine/intake/enums.js");

function terminateExecution(msg) {
  console.error("[SEV_FATAL] [EXECUTION_TERMINATED] " + msg);
  process.exit(1);
}

function parseArg(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  const v = process.argv[i + 1];
  return (!v || v.startsWith("--")) ? null : v;
}

function readJsonIfExists(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function runEngine(contextName, targetUrl, outDir, runId) {
  const script = path.join(process.cwd(), "engine", contextName === "desktop" ? "run_smoke_desktop.js" : "run_smoke_mobile.js");
  if (!fs.existsSync(script)) {
    return { outcome: ENUMS.OUTCOME.CONSTRAINED, constraintclass: ENUMS.CONSTRAINT.HARDCRASH, note: "ENGINE_SCRIPT_MISSING" };
  }

  const provision = path.join(outDir, "provision.json");
  const args = [script, "--url", targetUrl, "--out", outDir, "--run-id", String(runId)];
  if (fs.existsSync(provision)) args.push("--provision", provision);

  const res = spawnSync(process.execPath, args, {
    stdio: ["inherit", "pipe", "pipe"],
    timeout: 90000,
    maxBuffer: 10 * 1024 * 1024
  });

  const artifactPath = path.join(outDir, `run_${runId}_${contextName}.json`);
  const artifact = readJsonIfExists(artifactPath);

  if (artifact) {
    return {
      outcome: artifact.outcome || ENUMS.OUTCOME.CONSTRAINED,
      constraintclass: artifact.constraintclass || null,
      httpStatus: artifact.httpStatus || null,
      finalUrl: artifact.finalUrl || null,
      signals: Array.isArray(artifact.signals) ? artifact.signals : [],
      provisioned_lane_used: Boolean(artifact.provisioned_lane && artifact.provisioned_lane.used)
    };
  }

  const combined = ((res.stdout || "") + (res.stderr || "")).toString().toLowerCase();
  const cc =
    combined.includes("http_401") || combined.includes("401") ? ENUMS.CONSTRAINT.AUTHWALL :
    combined.includes("http_451") || combined.includes("451") ? ENUMS.CONSTRAINT.GEOBLOCK :
    (combined.includes("captcha") || combined.includes("cloudflare") || combined.includes("challenge") || combined.includes("checkpoint") || combined.includes("403") || combined.includes("429")) ? ENUMS.CONSTRAINT.BOTMITIGATION :
    combined.includes("timeout") ? ENUMS.CONSTRAINT.HARDCRASH :
    ENUMS.CONSTRAINT.NAVIMPEDIMENT;

  return { outcome: ENUMS.OUTCOME.CONSTRAINED, constraintclass: cc, note: "ARTIFACT_MISSING", provisioned_lane_used: false };
}

function writeConstraintNote(outDir, contextName, targetUrl, constraintClass, extraLines) {
  const fileName = contextName === "desktop" ? "desktop_defensive_note.txt" : "mobile_defensive_note.txt";
  const lines = [
    "INTERNAL - NOT FOR DISCLOSURE",
    "generated_utc: " + new Date().toISOString(),
    "target: " + targetUrl,
    "context: " + contextName,
    "constraint: " + (constraintClass || ENUMS.CONSTRAINT.NAVIMPEDIMENT),
    ""
  ];

  if (Array.isArray(extraLines) && extraLines.length > 0) lines.push(...extraLines);

  lines.push(
    "",
    "Verification was attempted and encountered a technical barrier.",
    "This note is stored for internal records only."
  );

  fs.writeFileSync(path.join(outDir, fileName), lines.join("\n"), "utf8");
}

function main() {
  const outDir = parseArg("--out") || path.join(process.cwd(), "_intake_out");
  const targetsPath = path.join(outDir, "targets.txt");
  const runUnitsPath = path.join(outDir, "rununits.json");
  const mobileFlagPath = path.join(outDir, "mobileanchored.flag");

  if (!fs.existsSync(targetsPath)) terminateExecution("Missing targets.txt at " + targetsPath);
  if (!fs.existsSync(runUnitsPath)) terminateExecution("Missing rununits.json at " + runUnitsPath);

  const rawTarget = fs.readFileSync(targetsPath, "utf8").trim();
  if (!rawTarget) terminateExecution("targets.txt is empty");

  const targetUrl = rawTarget.startsWith("http") ? rawTarget : ("https://" + rawTarget);
  const mobileAnchorStatus = fs.existsSync(mobileFlagPath) ? fs.readFileSync(mobileFlagPath, "utf8").trim() : "defensive";

  fs.mkdirSync(outDir, { recursive: true });

  console.log("[SEV_INFO] [INTAKE_START] Scope: ALLEGATION_SCOPED");
  console.log("[SEV_INFO] [INTAKE_START] Target: " + targetUrl);
  console.log("[SEV_INFO] [INTAKE_START] Mobile Anchor Status: " + mobileAnchorStatus);

  const desktopResults = [];
  const mobileResults = [];

  const SUFFICIENCY_THRESHOLD = 2;
  const MAX_RUNS_PER_CONTEXT = 2;

  const PERSISTENT_BARRIERS = new Set([ENUMS.CONSTRAINT.BOTMITIGATION, ENUMS.CONSTRAINT.AUTHWALL, ENUMS.CONSTRAINT.GEOBLOCK]);

  let desktopObserved = 0;
  let mobileObserved = 0;

  let desktopRuns = 0;
  let mobileRuns = 0;

  let desktopStopped = false;
  let mobileStopped = false;

  let lastDesktopConstraint = "";
  let lastMobileConstraint = "";

  let runId = 0;

  while (true) {
    const desktopQualified = desktopObserved >= SUFFICIENCY_THRESHOLD;
    const mobileQualified = mobileObserved >= SUFFICIENCY_THRESHOLD;

    const desktopDone = desktopQualified || desktopStopped || (desktopRuns >= MAX_RUNS_PER_CONTEXT);
    const mobileDone = mobileQualified || mobileStopped || (mobileRuns >= MAX_RUNS_PER_CONTEXT);

    if (desktopDone && mobileDone) break;

    let ctx;
    if (!desktopDone && !mobileDone) ctx = (runId % 2 === 0) ? "desktop" : "mobile";
    else if (!desktopDone) ctx = "desktop";
    else ctx = "mobile";

    runId++;

    console.log("[SEV_INFO] [RUN_INITIATED] ID: " + runId + " | Context: " + ctx.toUpperCase());
    const outcome = runEngine(ctx, targetUrl, outDir, runId);

    if (ctx === "desktop") {
      desktopRuns++;
      desktopResults.push({ runId, ...outcome });

      if (outcome.outcome === ENUMS.OUTCOME.OBSERVED) desktopObserved++;
      if (outcome.outcome === ENUMS.OUTCOME.CONSTRAINED) lastDesktopConstraint = outcome.constraintclass || ENUMS.CONSTRAINT.NAVIMPEDIMENT;

      if (outcome.outcome === ENUMS.OUTCOME.CONSTRAINED && PERSISTENT_BARRIERS.has(outcome.constraintclass || "")) {
        desktopStopped = true;
      }

      console.log("[SEV_INFO] [RUN_COMPLETED] Desktop Outcome: " + outcome.outcome + " | Observed: " + desktopObserved + "/" + SUFFICIENCY_THRESHOLD);
      if (desktopStopped) console.log("[SEV_WARN] [RUN_STOPPED] Desktop persistent barrier: " + (outcome.constraintclass || ""));
    } else {
      mobileRuns++;
      mobileResults.push({ runId, ...outcome });

      if (outcome.outcome === ENUMS.OUTCOME.OBSERVED) mobileObserved++;
      if (outcome.outcome === ENUMS.OUTCOME.CONSTRAINED) lastMobileConstraint = outcome.constraintclass || ENUMS.CONSTRAINT.NAVIMPEDIMENT;

      if (outcome.outcome === ENUMS.OUTCOME.CONSTRAINED && PERSISTENT_BARRIERS.has(outcome.constraintclass || "")) {
        mobileStopped = true;
      }

      console.log("[SEV_INFO] [RUN_COMPLETED] Mobile Outcome: " + outcome.outcome + " | Observed: " + mobileObserved + "/" + SUFFICIENCY_THRESHOLD);
      if (mobileStopped) console.log("[SEV_WARN] [RUN_STOPPED] Mobile persistent barrier: " + (outcome.constraintclass || ""));
    }
  }

  const desktopQualified = desktopObserved >= SUFFICIENCY_THRESHOLD;
  const mobileQualified = mobileObserved >= SUFFICIENCY_THRESHOLD;

  const anyConstraints = (!desktopQualified && desktopRuns > 0) || (!mobileQualified && mobileRuns > 0) || desktopStopped || mobileStopped;

  let determination, tier;
  if (desktopQualified && mobileQualified) {
    determination = ENUMS.DETERMINATION.DUAL;
    tier = "TIER_1_DUAL";
  } else if (desktopQualified) {
    determination = ENUMS.DETERMINATION.DESKTOP;
    tier = "TIER_2_DESKTOP";
  } else if (anyConstraints) {
    determination = ENUMS.DETERMINATION.CONSTRAINED;
    tier = "TIER_STOP_CONSTRAINTS";
  } else {
    determination = ENUMS.DETERMINATION.INELIGIBLE;
    tier = "TIER_STOP_INELIGIBLE";
  }

  fs.writeFileSync(path.join(outDir, "desktop_results.json"), JSON.stringify(desktopResults, null, 2), "utf8");
  fs.writeFileSync(path.join(outDir, "mobile_results.json"), JSON.stringify(mobileResults, null, 2), "utf8");

  fs.writeFileSync(path.join(outDir, "DETERMINATION.txt"), [
    "ACCESS FORENSICS - CASE DETERMINATION",
    "generated_utc: " + new Date().toISOString(),
    "scope: ALLEGATION_SCOPED",
    "target: " + targetUrl,
    "",
    "DETERMINATION: " + determination,
    "TIER: " + tier,
    ""
  ].join("\n"), "utf8");

  if (determination === ENUMS.DETERMINATION.CONSTRAINED) {
    if (!desktopQualified && desktopRuns > 0) {
      writeConstraintNote(outDir, "desktop", targetUrl, lastDesktopConstraint, []);
    }
    if (!mobileQualified && mobileRuns > 0) {
      writeConstraintNote(outDir, "mobile", targetUrl, lastMobileConstraint, ["mobile_anchor: " + mobileAnchorStatus]);
    }
  }

  console.log("[SEV_INFO] [INTAKE_COMPLETE] Determination: " + determination);
  console.log("[SEV_INFO] [INTAKE_COMPLETE] Tier Map: " + tier);
  console.log("[SEV_INFO] [INTAKE_COMPLETE] desktop_results.json : " + path.join(outDir, "desktop_results.json"));
  console.log("[SEV_INFO] [INTAKE_COMPLETE] mobile_results.json  : " + path.join(outDir, "mobile_results.json") + " [INTERNAL]");
  console.log("[SEV_INFO] [INTAKE_COMPLETE] DETERMINATION.txt    : " + path.join(outDir, "DETERMINATION.txt"));
}

try {
  main();
} catch (e) {
  terminateExecution(e && e.stack ? e.stack : String(e));
}
