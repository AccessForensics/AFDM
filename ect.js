/**
 * ect.js
 * Access Forensics Executor (Hardened Golden Master, Locked Policy)
 *
 * FINAL LOCKED CONTRACT (DO NOT DRIFT)
 *
 * 1) Error Classification, at the source
 * - SelectorAmbiguity is stamped mechanically at the moment the executor observes count > 1 where strict-single is required.
 * - No regex parsing of error messages.
 *
 * 2) STATUS.txt is self-contained
 * - Always includes: ERROR TYPE: <ErrorName or (none)>
 *
 * 3) Step Indexing Contract (permanent)
 * - Step 001 is ALWAYS Navigation (provenance load).
 * - Plan steps execute as Step 002+.
 * - Execution index is the source of truth, plan indices are recorded as plan_step_index for mapping.
 *
 * PROTOCOL
 * - Mechanical execution, no analysis.
 * - Strict selector ambiguity (0 or >1 hard fail) unless wait_selector allow_multiple_matches:true.
 * - wait_selector allow_multiple_matches:true requires: attached >= 1, stable count over stabilization window, at least one visible match.
 * - Passive capture mode forbids state-changing steps.
 * - Always seals packet (success or error).
 * - goal_text is forbidden (flow or steps), hard fail.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

/* =========================
   CONFIG & POLICIES
   ========================= */

const RETAIN_RAW = process.env.ECT_RETAIN_RAW === "1";
const ECT_MODE = process.env.ECT_MODE || "default";
const RAW_RETENTION_DAYS = 180;

const VIEWPORT = { width: 1366, height: 768 };
const NAV_TIMEOUT_MS = 30000;
const STEP_TIMEOUT_MS = 10000;
const STABILIZE_MS = 150;

const NOTE_BANNED_PATTERNS = [
  /\bwcag\b/gi,
  /\bada\b/gi,
  /\btitle\s*iii\b/gi,
  /\bcompliant\b/gi,
  /\bnon-?compliant\b/gi,
  /\bviolation\b/gi,
  /\bviolates\b/gi,
  /\binaccessible\b/gi,
  /\bbarrier\b/gi,
  /\bfail(s|ed|ure)?\b/gi,
  /\bpass(ed|es)?\b/gi,
];

const INTERACTIVE_STEPS = ["click_selector", "type_selector", "fill", "press", "tab"];
const PASSIVE_ALLOWED_STEPS = ["wait_selector", "scroll", "assert_text_present", "assert_url_contains"];

/* =========================
   HELPERS
   ========================= */

function nowIso() {
  return new Date().toISOString();
}

function pad3(n) {
  if (typeof n === "string" && n.toUpperCase() === "GOAL") return "GOAL";
  return String(n).padStart(3, "0");
}

function safeToken(s) {
  const t = String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return t || "gen";
}

function canonicalFolderForAllegation(rawId) {
  const raw = String(rawId || "").trim();
  if (!raw) return "GEN";
  if (raw.toUpperCase() === "GEN") return "GEN";
  return safeToken(raw);
}

function canonicalAllegationId(rawId) {
  const raw = String(rawId || "").trim();
  if (!raw) return "GEN";
  if (raw.toUpperCase() === "GEN") return "GEN";
  return raw;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf-8");
}

function readJsonStripBom(filePath) {
  const buf = fs.readFileSync(filePath);
  const hasUtf8Bom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  const text = (hasUtf8Bom ? buf.slice(3) : buf).toString("utf8");
  return JSON.parse(text);
}

function sha256Bytes(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function sha256File(filePath) {
  return sha256Bytes(fs.readFileSync(filePath));
}

function statSize(filePath) {
  return fs.statSync(filePath).size;
}

function stableStringify(value, indent = 2) {
  const seen = new WeakSet();

  function sorter(v) {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v)) throw new Error("Cyclic reference detected");
    seen.add(v);

    if (Array.isArray(v)) return v.map(sorter);

    const keys = Object.keys(v).sort((a, b) => a.localeCompare(b));
    const out = {};
    for (const k of keys) out[k] = sorter(v[k]);
    return out;
  }

  return JSON.stringify(sorter(value), null, indent) + "\n";
}

function normalizeStartUrl(input) {
  const s = String(input || "").trim();
  if (!s) return s;

  if (/^https?:\/\//i.test(s)) return s;
  if (/^file:\/\/\//i.test(s)) return s;

  const projectRoot = path.resolve(__dirname);

  if (/^file:/i.test(s)) {
    const rest = s.replace(/^file:\/*/i, "");
    const rel = rest.replace(/^\/+/, "");
    const abs = path.resolve(projectRoot, rel);
    return pathToFileURL(abs).href;
  }

  if (/^[a-zA-Z]:[\\/]/.test(s)) {
    return pathToFileURL(s).href;
  }

  return s;
}

/* =========================
   REDACTION & REPORT
   ========================= */

function sanitizeNote(note, consoleLog) {
  if (!note) return null;

  const original = String(note);
  let s = original;
  let redacted = false;

  for (const re of NOTE_BANNED_PATTERNS) {
    if (re.test(s)) {
      s = s.replace(re, "[REDACTED]");
      redacted = true;
    }
  }

  if (redacted) {
    consoleLog.push({
      timestamp_utc: nowIso(),
      type: "compliance_redaction",
      message: "A note contained banned inference terminology and was redacted.",
      original_length: original.length,
    });
  }

  return s;
}

function renderExecutionReportTxt({ protocolVersion, runId, flow, runMetadata, interactionLog, evidenceIndex }) {
  const lines = [];
  const status = runMetadata.status === "success" ? "SUCCESS" : "INCOMPLETE/ERROR";

  const allegations = Array.isArray(flow.allegations) ? flow.allegations : [];
  const allegationOrder = allegations.map((a) => canonicalAllegationId(a && a.id)).filter(Boolean);
  const labels = new Map(allegations.map((a) => [canonicalAllegationId(a && a.id), String((a && a.label) || "")]));

  const grouped = new Map();
  for (const entry of interactionLog) {
    const key = canonicalAllegationId(entry.allegation_id);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(entry);
  }

  const allKeys = Array.from(grouped.keys());
  const ordered = [];

  for (const aid of allegationOrder) {
    if (grouped.has(aid)) ordered.push(aid);
  }
  if (grouped.has("GEN") && !ordered.includes("GEN")) ordered.push("GEN");
  for (const k of allKeys) {
    if (!ordered.includes(k)) ordered.push(k);
  }

  lines.push("Record of Procedural Execution");
  lines.push(`Protocol Version: ${protocolVersion}`);
  lines.push("");
  lines.push("1.0 Execution Context");
  lines.push("This document records a mechanical procedural execution against the target website.");
  lines.push("No legal analysis, interpretation, or opinion is expressed herein.");
  lines.push("");
  lines.push(`Run ID:\t${runId}`);
  lines.push(`Flow ID:\t${flow.flow_id || ""}`);
  lines.push(`Target URL:\t${flow.start_url || ""}`);
  if (runMetadata.start_url_resolved) lines.push(`Resolved URL:\t${runMetadata.start_url_resolved}`);
  lines.push(`Capture Mode:\t${String(runMetadata.capture_mode || "").toUpperCase()}`);
  lines.push(`Raw Retention:\t${RETAIN_RAW ? "ENABLED" : "DISABLED"}`);
  lines.push(`ECT Mode:\t${String(runMetadata.ect_mode || "").toUpperCase()}`);
  lines.push(`Start Time (UTC):\t${runMetadata.started_at_utc}`);
  lines.push(`End Time (UTC):\t${runMetadata.finished_at_utc}`);
  lines.push(`Final Status:\t${status}`);
  if (runMetadata.error) lines.push(`Error Detail:\t${runMetadata.error}`);
  if (runMetadata.error_type) lines.push(`Error Type:\t${runMetadata.error_type}`);
  lines.push("");

  lines.push("1.1 Policy Overrides");
  const overrides = interactionLog.filter((e) => e && e.action === "policy_override");
  if (!overrides.length) {
    lines.push("None recorded.");
  } else {
    lines.push("The following explicit plan-directed overrides were recorded:");
    for (const o of overrides) {
      const idx = typeof o.step_index === "number" ? pad3(o.step_index) : String(o.step_index);
      lines.push(`- Step ${idx}: ${o.note || ""}`.trim());
    }
  }
  lines.push("");

  lines.push("2.0 Record of Steps (Grouped by Allegation)");
  lines.push("Index Contract: Step 001 is Navigation. Plan steps begin at Step 002.");
  lines.push("");

  for (const aid of ordered) {
    const entries = grouped.get(aid) || [];
    if (!entries.length) continue;

    const label = labels.get(aid) || "";
    const header = aid === "GEN" ? "GEN (General)" : `${aid}${label ? ` (${label})` : ""}`;
    lines.push(`ALLEGATION BUCKET: ${header}`);

    for (const e of entries) {
      const idx = typeof e.step_index === "number" ? pad3(e.step_index) : String(e.step_index);
      const plan = typeof e.plan_step_index === "number" ? ` | Plan: ${pad3(e.plan_step_index)}` : "";
      const note = e.note ? ` | Note: ${e.note}` : "";
      const err = e.error_message ? ` | Error: ${e.error_message}` : "";
      lines.push(`[${idx}] Action: ${e.action} | Result: ${e.result}${plan}${note}${err}`);
    }
    lines.push("");
  }

  lines.push("3.0 Exhibit Inventory");
  lines.push("");

  for (const ev of evidenceIndex) {
    const idx = pad3(ev.step_index);
    const aid = canonicalAllegationId(ev.allegation_id);
    lines.push(`[${aid}] Step ${idx}: ${ev.rel_path}`);
  }

  lines.push("");
  lines.push("4.0 Verification");
  lines.push("Hash verification instructions are provided in 00_README.txt.");
  lines.push("");

  return lines.join("\n");
}

/* =========================
   MAIN
   ========================= */

(async function main() {
  const flowPath = process.argv[2];
  if (!flowPath) {
    console.error("USAGE: node ect.js <flow_plan.json>");
    process.exit(1);
  }

  let flow;
  try {
    flow = readJsonStripBom(flowPath);
  } catch (e) {
    console.error("FATAL: Invalid flow JSON.");
    console.error(e.message);
    process.exit(1);
  }

  if (!flow || typeof flow !== "object") {
    console.error("FATAL: Flow must be a JSON object.");
    process.exit(1);
  }
  if (!flow.flow_id || typeof flow.flow_id !== "string") {
    console.error("FATAL: flow.flow_id missing/invalid.");
    process.exit(1);
  }
  if (!flow.start_url || typeof flow.start_url !== "string") {
    console.error("FATAL: flow.start_url missing/invalid.");
    process.exit(1);
  }
  if (!Array.isArray(flow.steps)) {
    console.error("FATAL: flow.steps missing/invalid.");
    process.exit(1);
  }

  if (typeof flow.goal_text !== "undefined" && flow.goal_text !== null) {
    console.error("FATAL: goal_text is forbidden in this protocol version. Remove goal_text from the flow plan.");
    process.exit(1);
  }

  const captureMode = String(flow.capture_mode || (flow.visual_only === true ? "passive" : "interactive")).toLowerCase();
  if (!["passive", "interactive"].includes(captureMode)) {
    console.error('FATAL: capture_mode must be "passive" or "interactive".');
    process.exit(1);
  }

  if (captureMode === "passive") {
    for (const s of flow.steps) {
      const t = String((s && s.type) || "");
      if (!PASSIVE_ALLOWED_STEPS.includes(t)) {
        console.error(
          `FATAL: Passive capture mode forbids step type "${t}". Allowed: ${PASSIVE_ALLOWED_STEPS.join(", ")}.`
        );
        process.exit(1);
      }
    }
  }

  if (captureMode === "interactive") {
    const hasInteraction = flow.steps.some((s) => INTERACTIVE_STEPS.includes(String((s && s.type) || "")));
    if (!hasInteraction) {
      console.error("FATAL: Quality Gate Failure. No interactive step types were detected in this flow plan.");
      console.error('Add at least one interactive step (click_selector, fill, press, tab), or use capture_mode: "passive".');
      process.exit(1);
    }
  }

  const protocolVersion = String(flow.protocol_version || "SKU-A v3.6 (Hardened, Locked)");
  const startUrlResolved = normalizeStartUrl(flow.start_url);

  const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
  const runId = `${timestamp}_${safeToken(flow.case_label || "case")}_${safeToken(flow.flow_id)}`;

  const runDir = path.join("runs", runId);
  const deliverableDir = path.join(runDir, "Deliverable_Packet");
  const rawDir = path.join(runDir, "_raw");

  const reportDir = path.join(deliverableDir, "01_Report");
  const exhibitsDir = path.join(deliverableDir, "02_Exhibits");
  const verificationDir = path.join(deliverableDir, "03_Verification");

  const rawScreenshotsDir = path.join(rawDir, "screenshots");
  const rawHtmlDir = path.join(rawScreenshotsDir, "html");
  const rawAxDir = path.join(rawScreenshotsDir, "ax");
  const rawVideoTempDir = path.join(rawDir, "video_temp");

  [runDir, deliverableDir, reportDir, exhibitsDir, verificationDir].forEach(ensureDir);
  if (RETAIN_RAW) [rawDir, rawScreenshotsDir, rawHtmlDir, rawAxDir].forEach(ensureDir);

  const allegations = Array.isArray(flow.allegations) ? flow.allegations : [];
  for (const a of allegations) {
    if (a && a.id) ensureDir(path.join(exhibitsDir, canonicalFolderForAllegation(a.id)));
  }
  ensureDir(path.join(exhibitsDir, "GEN"));

  const interactionLog = [];
  const evidenceIndex = [];
  const consoleLog = [];

  let stepIndex = 0;
  let runStatus = "running";
  let runError = null;
  let runErrorType = null;

  let playwrightVersion = "unknown";
  try {
    playwrightVersion = require("playwright/package.json").version;
  } catch (_) {}

  const runMetadata = {
    run_id: runId,
    protocol_version: protocolVersion,
    flow_id: flow.flow_id,
    start_url: flow.start_url,
    start_url_resolved: startUrlResolved,
    goal_selector: flow.goal_selector ? String(flow.goal_selector) : null,
    goal_expectation: flow.goal_expectation ? String(flow.goal_expectation) : null,
    capture_mode: captureMode,
    retain_raw: RETAIN_RAW,
    ect_mode: ECT_MODE,
    started_at_utc: nowIso(),
    finished_at_utc: null,
    status: "running",
    error: null,
    error_type: null,
    raw_retention_days: RETAIN_RAW ? RAW_RETENTION_DAYS : 0,
    contracts: {
      step_001_is_navigation: true,
      execution_index_is_source_of_truth: true,
      plan_steps_begin_at_002: true,
      selector_ambiguity_classified_at_source: true,
      status_includes_error_type: true,
    },
    stabilization: {
      window_ms: STABILIZE_MS,
      policy:
        "Log instability. Strict single requires final count === 1. wait_selector allow_multiple requires stable count, else hard fail.",
    },
    environment: {
      node_version: process.version,
      playwright_version: playwrightVersion,
      chromium_version: null,
      os_type: os.type(),
      os_release: os.release(),
      os_platform: os.platform(),
      os_arch: os.arch(),
      timezone_reported: Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown",
      locale_reported: Intl.DateTimeFormat().resolvedOptions().locale || "unknown",
    },
  };

  writeJson(path.join(verificationDir, "run_metadata.json"), runMetadata);

  try {
    fs.writeFileSync(path.join(reportDir, "flow_plan.sealed.json"), stableStringify(flow, 2), "utf-8");
  } catch (_) {}

  const retentionNote = RETAIN_RAW
    ? `Native forensic files (HAR, Trace, Video, HTML, AX) are preserved separately in the '_raw' archive for ${RAW_RETENTION_DAYS} days.`
    : "Raw native artifacts (HAR, Trace, Video) were NOT retained for this run (ECT_RETAIN_RAW != 1).";

  fs.writeFileSync(
    path.join(deliverableDir, "00_README.txt"),
    `EVIDENCE PACKET INSTRUCTIONS

1. Integrity Verification
   Calculate the SHA-256 hash of '03_Verification/manifest_core.json'.
   Compare it to '03_Verification/packet_hash.txt'.
   They must match exactly.

   NOTE: '03_Verification/manifest.json' is the full inventory including sealing artifacts.
   It is not used for the packet_hash computation to avoid circular hashing.

2. Contents
   01_Report: Factual execution report and logs.
   02_Exhibits: Screenshots grouped by allegation folder.
   03_Verification: Cryptographic sealing data (manifest + manifest_core + packet hash + status banner).

3. Native Artifacts
   ${retentionNote}

4. Status Banner
   '03_Verification/STATUS.txt' is informational and is not required for hash verification.
`,
    "utf-8"
  );

  let browser = null;
  let context = null;
  let page = null;

  function hardFailPolicy(message) {
    const err = new Error(message);
    err.name = "PolicyViolation";
    throw err;
  }

  async function captureEvidence(label, allegationIdRaw) {
    const aidRaw = canonicalAllegationId(allegationIdRaw);
    const folder = canonicalFolderForAllegation(aidRaw);

    const stepStr = pad3(stepIndex);
    const screenshotName = `screenshot_step_${stepStr}.png`;
    const absShot = path.join(exhibitsDir, folder, screenshotName);
    const relShot = `02_Exhibits/${folder}/${screenshotName}`;

    try {
      await page.screenshot({ path: absShot, fullPage: false });
    } catch (e) {
      consoleLog.push({
        timestamp_utc: nowIso(),
        type: "evidence_error",
        message: `Screenshot failed: ${e && e.message ? e.message : String(e)}`,
      });
    }

    let relHtml = null;
    let relAx = null;

    if (RETAIN_RAW) {
      try {
        const html = await page.content();
        const htmlName = `step_${stepStr}.html`;
        fs.writeFileSync(path.join(rawHtmlDir, htmlName), html, "utf-8");
        relHtml = `_raw/screenshots/html/${htmlName}`;
      } catch (e) {
        consoleLog.push({
          timestamp_utc: nowIso(),
          type: "evidence_error",
          message: `HTML capture failed: ${e && e.message ? e.message : String(e)}`,
        });
      }

      try {
        const ax = await page.accessibility.snapshot({ interestingOnly: false });
        const axName = `step_${stepStr}.json`;
        writeJson(path.join(rawAxDir, axName), ax || { note: "AX snapshot returned null" });
        relAx = `_raw/screenshots/ax/${axName}`;
      } catch (e) {
        const axName = `step_${stepStr}.json`;
        writeJson(path.join(rawAxDir, axName), {
          error: "AX snapshot failed",
          message: e && e.message ? e.message : String(e),
        });
        relAx = `_raw/screenshots/ax/${axName}`;
      }
    }

    const rec = {
      step_index: stepIndex,
      allegation_id: aidRaw,
      folder,
      label: label || null,
      filename: screenshotName,
      rel_path: relShot,
      page_url: page ? page.url() : null,
      raw_html: relHtml,
      raw_ax: relAx,
      timestamp_utc: nowIso(),
    };

    evidenceIndex.push(rec);
    return rec;
  }

  async function stabilizedCount(selector, timeoutMs, contextObj) {
    try {
      await page.waitForSelector(selector, { state: "attached", timeout: timeoutMs });
    } catch (_) {}

    const loc = page.locator(selector);

    const c1 = await loc.count();
    await page.waitForTimeout(STABILIZE_MS);
    const c2 = await loc.count();

    const unstable = c1 !== c2;
    if (unstable) {
      consoleLog.push({
        timestamp_utc: nowIso(),
        type: "selector_instability",
        selector: String(selector),
        first_count: c1,
        final_count: c2,
        window_ms: STABILIZE_MS,
      });

      interactionLog.push({
        step_index: stepIndex,
        plan_step_index: typeof contextObj?.plan_step_index === "number" ? contextObj.plan_step_index : null,
        allegation_id: canonicalAllegationId(contextObj && contextObj.allegation_id),
        action: "instability_log",
        result: "info",
        error_message: null,
        note: `Selector instability logged. selector="${String(selector)}" first=${c1} final=${c2} window_ms=${STABILIZE_MS}`,
        url: page.url(),
        timestamp_utc: nowIso(),
      });
    }

    return { locator: loc, first: c1, final: c2, unstable };
  }

  async function strictSingle(selector, timeoutMs, contextObj) {
    if (!selector) throw new Error("Step requires selector");

    const sample = await stabilizedCount(selector, timeoutMs, contextObj);
    const c = sample.final;

    if (c === 0) {
      throw new Error(`Selector "${selector}" not found (0 matches).`);
    }

    if (c > 1) {
      const err = new Error(
        `Ambiguity Error: Selector "${selector}" matched ${c} elements (final count). Execution halted to prevent arbitrary interaction.`
      );
      err.name = "SelectorAmbiguity";
      throw err;
    }

    return sample.locator.first();
  }

  async function anyVisibleMatch(selector, maxToCheck, perCheckTimeoutMs) {
    try {
      const loc = page.locator(selector);
      const count = await loc.count();
      const n = Math.min(count, maxToCheck);

      for (let i = 0; i < n; i++) {
        const one = loc.nth(i);
        try {
          const vis = await one.isVisible({ timeout: perCheckTimeoutMs });
          if (vis) return true;
        } catch (_) {}
      }
    } catch (_) {}
    return false;
  }

  async function waitSelector(selector, timeoutMs, allowMultiple, contextObj) {
    if (!selector) throw new Error("wait_selector requires selector");

    if (!allowMultiple) {
      const loc = await strictSingle(selector, timeoutMs, contextObj);
      await loc.waitFor({ state: "visible", timeout: timeoutMs });
      return;
    }

    const sample = await stabilizedCount(selector, timeoutMs, contextObj);
    const cFinal = sample.final;

    if (cFinal === 0) {
      throw new Error(`Selector "${selector}" not found (0 matches).`);
    }

    const stabilityText = sample.unstable ? `unstable (${sample.first} -> ${cFinal})` : "stable";

    consoleLog.push({
      timestamp_utc: nowIso(),
      type: "policy_override",
      override_type: "wait_selector_allow_multiple_matches",
      step_index: stepIndex,
      plan_step_index: typeof contextObj?.plan_step_index === "number" ? contextObj.plan_step_index : null,
      allegation_id: canonicalAllegationId(contextObj && contextObj.allegation_id),
      selector: String(selector),
      observed_count: cFinal,
      stability: stabilityText,
    });

    interactionLog.push({
      step_index: stepIndex,
      plan_step_index: typeof contextObj?.plan_step_index === "number" ? contextObj.plan_step_index : null,
      allegation_id: canonicalAllegationId(contextObj && contextObj.allegation_id),
      action: "policy_override",
      result: "info",
      error_message: null,
      note: `wait_selector override used (allow_multiple_matches:true). selector="${String(selector)}" final_count=${cFinal} stability="${stabilityText}"`,
      url: page.url(),
      timestamp_utc: nowIso(),
    });

    if (sample.unstable) {
      throw new Error(
        `wait_selector stability requirement not met: Selector "${selector}" count changed during stabilization window (first=${sample.first}, final=${sample.final}).`
      );
    }

    const anyVisible = await anyVisibleMatch(selector, 25, Math.min(1000, timeoutMs));
    if (!anyVisible) {
      throw new Error(
        `wait_selector allow_multiple_matches requires at least one visible match. Selector "${selector}" had ${cFinal} stable attached matches, visible matches = 0.`
      );
    }

    try {
      await page.waitForFunction(
        (sel) => {
          const els = Array.from(document.querySelectorAll(sel));
          return els.some((el) => {
            const r = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return style && style.visibility !== "hidden" && style.display !== "none" && r.width > 0 && r.height > 0;
          });
        },
        selector,
        { timeout: timeoutMs }
      );
    } catch (_) {}
  }

  async function executeStep(s, planStepIndex) {
    const t = String((s && s.type) || "");
    const sel = s && s.selector ? String(s.selector) : null;
    const timeout = Number((s && s.timeout_ms) || STEP_TIMEOUT_MS);

    const aidRaw = canonicalAllegationId(s && s.allegation_id);

    if (s && typeof s.allow_multiple_matches !== "undefined" && t !== "wait_selector") {
      hardFailPolicy(`Policy Violation: allow_multiple_matches is only permitted for wait_selector. Found on step type "${t}".`);
    }

    if (s && typeof s.goal_text !== "undefined" && s.goal_text !== null) {
      hardFailPolicy("Policy Violation: goal_text is forbidden in this protocol version. Remove goal_text from steps.");
    }

    const ctx = { allegation_id: aidRaw, plan_step_index: planStepIndex };

    if (t === "wait_selector") {
      const allowMulti = s && s.allow_multiple_matches === true;
      await waitSelector(sel, timeout, allowMulti, ctx);
      return;
    }

    if (t === "click_selector") {
      const loc = await strictSingle(sel, timeout, ctx);
      await loc.click({ timeout });
      return;
    }

    if (t === "type_selector" || t === "fill") {
      const loc = await strictSingle(sel, timeout, ctx);
      const val = String((s && (s.text ?? s.value)) ?? "");
      await loc.fill(val, { timeout });
      return;
    }

    if (t === "press") {
      await page.keyboard.press(String((s && s.key) || "Enter"));
      if (s && s.delay_ms) await page.waitForTimeout(Number(s.delay_ms));
      return;
    }

    if (t === "tab") {
      const count = Number((s && s.count) || 1);
      const delay = Number((s && s.delay_ms) || 100);
      for (let i = 0; i < count; i++) {
        await page.keyboard.press("Tab");
        if (delay > 0) await page.waitForTimeout(delay);
      }
      return;
    }

    if (t === "scroll") {
      const dy = Number((s && s.deltaY) || 500);
      const delay = Number((s && s.delay_ms) || 500);
      await page.mouse.wheel(0, dy);
      if (delay > 0) await page.waitForTimeout(delay);
      return;
    }

    if (t === "assert_text_present") {
      const txt = String((s && s.text) || "");
      if (!txt) throw new Error("assert_text_present requires text");
      await page.waitForFunction(
        (expected) => document.body && document.body.innerText && document.body.innerText.includes(expected),
        txt,
        { timeout: Number((s && s.timeout_ms) || 5000) }
      );
      return;
    }

    if (t === "assert_url_contains") {
      const expected = String((s && s.text) || "");
      if (!expected) throw new Error("assert_url_contains requires text");
      const url = page.url();
      if (!url.includes(expected)) throw new Error(`URL mismatch. Expected "${expected}", got "${url}"`);
      return;
    }

    throw new Error(`Unknown step type: ${t}`);
  }

  try {
    browser = await chromium.launch({ headless: true });
    runMetadata.environment.chromium_version = await browser.version();
    writeJson(path.join(verificationDir, "run_metadata.json"), runMetadata);

    context = await browser.newContext({
      viewport: VIEWPORT,
      locale: "en-US",
      timezoneId: "UTC",
      recordHar: RETAIN_RAW ? { path: path.join(rawDir, "network.har") } : undefined,
      recordVideo: RETAIN_RAW ? { dir: rawVideoTempDir } : undefined,
    });

    if (RETAIN_RAW) {
      await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    }

    page = await context.newPage();

    page.on("console", (msg) => {
      consoleLog.push({ timestamp_utc: nowIso(), type: msg.type(), message: msg.text() });
    });

    page.on("pageerror", (err) => {
      consoleLog.push({ timestamp_utc: nowIso(), type: "pageerror", message: String(err) });
    });

    /* Step 001: Navigation, permanent contract */
    stepIndex = 1;

    interactionLog.push({
      step_index: stepIndex,
      plan_step_index: null,
      allegation_id: "GEN",
      action: "navigation",
      result: "info",
      error_message: null,
      note: `Declared start_url: ${flow.start_url}`,
      url: flow.start_url,
      timestamp_utc: nowIso(),
    });

    interactionLog.push({
      step_index: stepIndex,
      plan_step_index: null,
      allegation_id: "GEN",
      action: "navigation_resolved",
      result: "info",
      error_message: null,
      note: `Resolved start_url: ${startUrlResolved}`,
      url: startUrlResolved,
      timestamp_utc: nowIso(),
    });

    await page.goto(startUrlResolved, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });

    await captureEvidence("Initial Load", "GEN");

    interactionLog.push({
      step_index: stepIndex,
      plan_step_index: null,
      allegation_id: "GEN",
      action: "navigation_final_url",
      result: "success",
      error_message: null,
      note: `Final URL after navigation: ${page.url()}`,
      url: page.url(),
      timestamp_utc: nowIso(),
    });

    /* Plan steps begin at Step 002 */
    for (let i = 0; i < flow.steps.length; i++) {
      const s = flow.steps[i];
      const planStepIndex = i + 1;

      stepIndex += 1;

      const aidRaw = canonicalAllegationId(s && s.allegation_id);
      const note = sanitizeNote(s && s.note ? s.note : null, consoleLog);

      let stepErr = null;
      try {
        await executeStep(s, planStepIndex);
      } catch (e) {
        stepErr = e;
      }

      await captureEvidence(s && s.type ? String(s.type) : "step", aidRaw);

      interactionLog.push({
        step_index: stepIndex,
        plan_step_index: planStepIndex,
        allegation_id: aidRaw,
        action: String((s && s.type) || ""),
        result: stepErr ? "error" : "success",
        error_message: stepErr ? (stepErr.message || String(stepErr)) : null,
        note,
        url: page.url(),
        timestamp_utc: nowIso(),
      });

      if (stepErr) {
        runStatus = "error";
        runErrorType = stepErr.name || "Error";
        runError = `Failed at step ${pad3(stepIndex)}: ${stepErr.message || String(stepErr)}`;
        const wrap = new Error(runError);
        wrap.name = runErrorType;
        throw wrap;
      }
    }

    /* Optional goal check */
    if (flow.goal_selector) {
      if (typeof flow.goal_text !== "undefined" && flow.goal_text !== null) {
        hardFailPolicy("Policy Violation: goal_text is forbidden in this protocol version.");
      }

      stepIndex += 1;

      const goalSelector = String(flow.goal_selector);
      const expectation = String(flow.goal_expectation || "present").toLowerCase();
      const goalLabel = flow.goal ? String(flow.goal) : "Goal Verification";
      const goalTimeout = Number(flow.goal_timeout_ms || STEP_TIMEOUT_MS);

      let goalErr = null;

      try {
        const sample = await stabilizedCount(goalSelector, goalTimeout, { allegation_id: "GEN", plan_step_index: null });
        const finalCount = sample.final;

        if (finalCount > 1) {
          const err = new Error(`Goal Failed: Selector "${goalSelector}" matched ${finalCount} elements (ambiguity).`);
          err.name = "SelectorAmbiguity";
          throw err;
        }

        const goalMet =
          (expectation === "present" && finalCount === 1) || (expectation === "absent" && finalCount === 0);

        if (!goalMet) {
          throw new Error(
            `Goal Failed: Selector "${goalSelector}" did not match expectation "${expectation}" (Final Count: ${finalCount})`
          );
        }
      } catch (e) {
        goalErr = e;
      }

      await captureEvidence(goalLabel, "GEN");

      interactionLog.push({
        step_index: "GOAL",
        plan_step_index: null,
        allegation_id: "GEN",
        action: "verify_goal",
        result: goalErr ? "error" : "success",
        error_message: goalErr ? (goalErr.message || String(goalErr)) : null,
        note: flow.goal ? `Goal: ${String(flow.goal)}` : null,
        url: page.url(),
        timestamp_utc: nowIso(),
      });

      if (goalErr) {
        runStatus = "error";
        runErrorType = goalErr.name || "Error";
        runError = `Failed at GOAL: ${goalErr.message || String(goalErr)}`;
        const wrap = new Error(runError);
        wrap.name = runErrorType;
        throw wrap;
      }
    }

    runStatus = "success";
  } catch (e) {
    runStatus = "error";
    runError = e && e.message ? e.message : String(e);
    runErrorType = runErrorType || (e && e.name ? e.name : "Error");
  } finally {
    runMetadata.finished_at_utc = nowIso();
    runMetadata.status = runStatus;
    runMetadata.error = runError || null;
    runMetadata.error_type = runErrorType || null;

    if (context && RETAIN_RAW) {
      try {
        await context.tracing.stop({ path: path.join(rawDir, "trace.zip") });
      } catch (_) {}
    }

    if (context) {
      try {
        await context.close();
      } catch (_) {}
    }

    if (browser) {
      try {
        await browser.close();
      } catch (_) {}
    }

    if (RETAIN_RAW) {
      try {
        if (fs.existsSync(rawVideoTempDir)) {
          const files = fs.readdirSync(rawVideoTempDir).filter((f) => f.toLowerCase().endsWith(".webm"));
          if (files.length >= 1) {
            files.sort((a, b) => a.localeCompare(b));
            const src = path.join(rawVideoTempDir, files[0]);
            const dst = path.join(rawDir, "video.webm");
            try {
              fs.renameSync(src, dst);
            } catch (_) {
              fs.copyFileSync(src, dst);
              fs.unlinkSync(src);
            }
          }
          fs.rmSync(rawVideoTempDir, { recursive: true, force: true });
        }
      } catch (e) {
        consoleLog.push({
          timestamp_utc: nowIso(),
          type: "video_error",
          message: e && e.message ? e.message : String(e),
        });
      }
    }

    const statusBanner = [
      `RUN STATUS: ${String(runStatus).toUpperCase()}`,
      `CAPTURE MODE: ${String(captureMode).toUpperCase()}`,
      `RUN ID: ${runId}`,
      `START (UTC): ${runMetadata.started_at_utc}`,
      `END (UTC): ${runMetadata.finished_at_utc}`,
      runMetadata.error ? `ERROR: ${runMetadata.error}` : "ERROR: (none)",
      runMetadata.error_type ? `ERROR TYPE: ${runMetadata.error_type}` : "ERROR TYPE: (none)",
      "",
      "NOTE: This file is informational and is not required for integrity verification.",
      "Integrity verification is performed using manifest_core.json and packet_hash.txt only.",
      "",
    ].join("\n");

    try {
      fs.writeFileSync(path.join(verificationDir, "STATUS.txt"), statusBanner, "utf-8");
    } catch (_) {}

    writeJson(path.join(reportDir, "interaction_log.json"), interactionLog);
    writeJson(path.join(reportDir, "evidence_index.json"), evidenceIndex);

    const policyOverrides = interactionLog.filter((e) => e && e.action === "policy_override");
    writeJson(path.join(reportDir, "policy_overrides.json"), policyOverrides);

    writeJson(path.join(verificationDir, "console.json"), consoleLog);
    writeJson(path.join(verificationDir, "run_metadata.json"), runMetadata);

    const reportTxt = renderExecutionReportTxt({
      protocolVersion,
      runId,
      flow,
      runMetadata,
      interactionLog,
      evidenceIndex,
    });
    fs.writeFileSync(path.join(reportDir, "Execution_Report.txt"), reportTxt, "utf-8");

    function walkWithSkips(dirAbs, rootAbs, skipRelSet, outFiles) {
      const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
      for (const ent of entries) {
        const abs = path.join(dirAbs, ent.name);
        if (ent.isDirectory()) {
          walkWithSkips(abs, rootAbs, skipRelSet, outFiles);
        } else if (ent.isFile()) {
          const rel = path.relative(rootAbs, abs).replace(/\\/g, "/");
          if (skipRelSet.has(rel)) continue;
          outFiles.push({ path: rel, sha256: sha256File(abs), size_bytes: statSize(abs) });
        }
      }
    }

    const relManifest = "03_Verification/manifest.json";
    const relManifestCore = "03_Verification/manifest_core.json";
    const relPacketHash = "03_Verification/packet_hash.txt";

    const core = { run_id: runId, created_at_utc: nowIso(), files: [] };
    const coreSkips = new Set([relManifest, relManifestCore, relPacketHash]);

    walkWithSkips(deliverableDir, deliverableDir, coreSkips, core.files);
    core.files.sort((a, b) => a.path.localeCompare(b.path));

    const coreStr = stableStringify(core, 2);
    fs.writeFileSync(path.join(verificationDir, "manifest_core.json"), coreStr, "utf-8");

    const packetHash = sha256Bytes(Buffer.from(coreStr, "utf-8"));
    fs.writeFileSync(path.join(verificationDir, "packet_hash.txt"), packetHash + "\n", "utf-8");

    const manifest = { run_id: runId, created_at_utc: nowIso(), files: [] };
    const fullSkips = new Set([relManifest]);

    walkWithSkips(deliverableDir, deliverableDir, fullSkips, manifest.files);
    manifest.files.sort((a, b) => a.path.localeCompare(b.path));

    const manifestStr = stableStringify(manifest, 2);
    fs.writeFileSync(path.join(verificationDir, "manifest.json"), manifestStr, "utf-8");

    console.log(`RUN COMPLETE: ${String(runStatus).toUpperCase()}`);
    console.log(`RUN ID: ${runId}`);
    console.log(`Deliverable: ${deliverableDir}`);
    console.log(`Packet Hash: ${packetHash}`);

    if (runStatus === "error") process.exit(1);
  }
})();
