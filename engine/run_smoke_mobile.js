"use strict";

const fs = require("fs");
const path = require("path");
const { webkit, devices } = require("playwright");
const ENUMS = require("../src/engine/intake/enums.js");
const CORE = require("../src/engine/intake/engine_core.js");

function terminateExecution(msg) {
  console.error("[SEV_FATAL] [MOBILE_ENGINE] " + msg);
  process.exit(1);
}

function pickDeviceProfile() {
  const candidates = ["iPhone 15", "iPhone 14 Pro", "iPhone 13", "iPhone 12 Pro"];
  for (const name of candidates) {
    if (devices && devices[name]) return { name, profile: devices[name] };
  }
  return { name: "generic_mobile", profile: null };
}

async function main() {
  const targetUrl = CORE.parseArg(process.argv, "--url");
  const outDir = CORE.parseArg(process.argv, "--out");
  const runId = CORE.parseArg(process.argv, "--run-id") || "0";
  const provisionPath = CORE.parseArg(process.argv, "--provision");

  if (!targetUrl) terminateExecution("Missing --url");
  if (!outDir) terminateExecution("Missing --out");

  fs.mkdirSync(outDir, { recursive: true });

  const stamp = CORE.getForensicStamp();
  const artifactPath = path.join(outDir, `run_${runId}_mobile.json`);
  const envPath = path.join(outDir, `run_${runId}_mobile_env.json`);

  const picked = pickDeviceProfile();

  const artifact = {
    runId,
    scope: "ALLEGATION_SCOPED",
    context: "mobile",
    url: targetUrl,
    render_stage: "domcontentloaded",
    time_local: stamp.time_local,
    epoch_ms: stamp.epoch_ms,
    tz_offset_min: stamp.tz_offset_min,
    outcome: ENUMS.OUTCOME.INSUFFICIENT,
    constraintclass: null,
    httpStatus: null,
    navUrl: null,
    finalUrl: null,
    title: null,
    signals: [],
    responseHeaders: {},
    challenge_fingerprint_sha256: null,
    challenge_fingerprint_bytes: 0,
    provisioned_lane: { used: false, source: null, cookie_names: [], header_names: [], rejected_cookie_names: [] },
    provisioned_lane_changed_outcome: false,
    methodology: ENUMS.METHODOLOGY,
    environment: {
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
      orientation: "portrait",
      deviceName: picked.name,
      locale: "en-US",
      timezoneId: "America/New_York",
      headless: true,
      playwrightVersion: null,
      browserName: "webkit",
      browserVersion: null,
      userAgent_runtime: null
    }
  };

  let browser = null;
  let exitCode = 1;

  try {
    artifact.environment.playwrightVersion = require("playwright/package.json").version;

    browser = await webkit.launch({ headless: true });
    artifact.environment.browserVersion = await browser.version();

    const provision = CORE.loadProvisionedLane(provisionPath, outDir);

    const base = picked.profile ? picked.profile : {};
    const ctxOptions = Object.assign({}, base, {
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
      ignoreHTTPSErrors: true,
      javaScriptEnabled: true,
      locale: "en-US",
      timezoneId: "America/New_York"
    });

    if (provision && provision.data && provision.data.extraHTTPHeaders && typeof provision.data.extraHTTPHeaders === "object") {
      ctxOptions.extraHTTPHeaders = provision.data.extraHTTPHeaders;
      artifact.provisioned_lane.used = true;
      artifact.provisioned_lane.source = provision.source;
      artifact.provisioned_lane.header_names = Object.keys(provision.data.extraHTTPHeaders);
    }

    const ctx = await browser.newContext(ctxOptions);

    if (provision && provision.data && Array.isArray(provision.data.cookies) && provision.data.cookies.length > 0) {
      const filtered = CORE.filterCookiesForTarget(provision.data.cookies, targetUrl);

      if (filtered.rejected.length > 0) {
        artifact.provisioned_lane.rejected_cookie_names = filtered.rejected.map(r => r.name).filter(Boolean);
        artifact.signals.push("PROVISIONED_COOKIE_REJECTIONS");
      }

      if (filtered.accepted.length > 0) {
        try {
          await ctx.addCookies(filtered.accepted);
          artifact.provisioned_lane.used = true;
          artifact.provisioned_lane.source = provision ? provision.source : "provision.json";
          artifact.provisioned_lane.cookie_names = Array.from(new Set(filtered.accepted.map(c => c && c.name).filter(Boolean)));
        } catch {
          artifact.signals.push("PROVISIONED_COOKIES_REJECTED");
        }
      }
    }

    const page = await ctx.newPage();
    artifact.environment.userAgent_runtime = await page.evaluate(() => navigator.userAgent);

    const res = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    artifact.navUrl = res ? res.url() : null;

    const status = res ? res.status() : 0;
    artifact.httpStatus = status;
    artifact.finalUrl = page.url();

    const headers = CORE.normalizeHeaders(res ? res.headers() : {});
    artifact.responseHeaders = CORE.pickHeaderSubset(headers);

    const html = await CORE.safePageContent(page);
    const htmlLower = html.toLowerCase();
    const finalUrlLower = String(artifact.finalUrl || "").toLowerCase();

    if (status === 401) {
      artifact.outcome = ENUMS.OUTCOME.CONSTRAINED;
      artifact.constraintclass = ENUMS.CONSTRAINT.AUTHWALL;
      artifact.signals = ["HTTP_401"];
      exitCode = 1;
    } else {
      const pw = CORE.detectPasswordWall(finalUrlLower, htmlLower);
      if (pw.isLikely) {
        artifact.outcome = ENUMS.OUTCOME.CONSTRAINED;
        artifact.constraintclass = ENUMS.CONSTRAINT.AUTHWALL;
        artifact.signals = pw.signals;
        exitCode = 1;
      } else {
        const geo = CORE.detectGeoblock(status, htmlLower);
        if (geo.isLikely) {
          artifact.outcome = ENUMS.OUTCOME.CONSTRAINED;
          artifact.constraintclass = ENUMS.CONSTRAINT.GEOBLOCK;
          artifact.signals = geo.signals;
          exitCode = 1;
        } else {
          const bot = CORE.detectBotMitigation(status, headers, htmlLower, finalUrlLower);
          if (bot.isLikely) {
            artifact.outcome = ENUMS.OUTCOME.CONSTRAINED;
            artifact.constraintclass = ENUMS.CONSTRAINT.BOTMITIGATION;
            artifact.signals = bot.signals;

            const snippet = html.slice(0, 65536);
            artifact.challenge_fingerprint_sha256 = CORE.sha256Utf8(snippet);
            artifact.challenge_fingerprint_bytes = Buffer.byteLength(snippet, "utf8");

            exitCode = 1;
          } else if (status >= 400 || status === 0) {
            artifact.outcome = ENUMS.OUTCOME.CONSTRAINED;
            artifact.constraintclass = ENUMS.CONSTRAINT.NAVIMPEDIMENT;
            artifact.signals = ["HTTP_" + String(status)];
            exitCode = 1;
          } else {
            artifact.outcome = ENUMS.OUTCOME.OBSERVED;
            artifact.title = await page.title();
            exitCode = 0;
          }
        }
      }
    }

    artifact.provisioned_lane_changed_outcome = Boolean(artifact.provisioned_lane.used && artifact.outcome === ENUMS.OUTCOME.OBSERVED);

    fs.writeFileSync(envPath, JSON.stringify(artifact.environment, null, 2), "utf8");
    await ctx.close();
  } catch (e) {
    const msg = String(e && e.message ? e.message : e).toLowerCase();
    artifact.outcome = ENUMS.OUTCOME.CONSTRAINED;
    artifact.constraintclass = msg.includes("timeout") ? ENUMS.CONSTRAINT.HARDCRASH : ENUMS.CONSTRAINT.NAVIMPEDIMENT;
    artifact.signals = [artifact.constraintclass === ENUMS.CONSTRAINT.HARDCRASH ? "ERR_TIMEOUT" : "ERR_NAV"];
    artifact.provisioned_lane_changed_outcome = false;
    exitCode = 1;
  } finally {
    try {
      fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2), "utf8");
      console.log("[SEV_INFO] [MOBILE_ENGINE] Artifact written: " + artifactPath);
      console.log("[AFDM_RUN_SUMMARY] outcome=" + artifact.outcome + " constraintclass=" + (artifact.constraintclass || "") + " httpStatus=" + String(artifact.httpStatus || 0));
    } catch (writeErr) {
      console.error("[SEV_FATAL] [MOBILE_ENGINE] Write failure: " + String(writeErr));
      exitCode = 1;
    }
    if (browser) await browser.close();
    process.exit(exitCode);
  }
}

main().catch(e => terminateExecution(String(e && e.stack ? e.stack : e)));
