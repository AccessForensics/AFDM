"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

function pad(n, w = 2) { return String(n).padStart(w, "0"); }

function getForensicStamp() {
  const d = new Date();
  const tzOffsetMin = -d.getTimezoneOffset();
  const sign = tzOffsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(tzOffsetMin);
  const offH = pad(Math.floor(abs / 60));
  const offM = pad(abs % 60);
  const localIso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}${sign}${offH}:${offM}`;
  return { time_local: localIso, epoch_ms: d.getTime(), tz_offset_min: tzOffsetMin };
}

function sha256Utf8(s) {
  return crypto.createHash("sha256").update(String(s || ""), "utf8").digest("hex");
}

function normalizeHeaders(h) {
  const out = {};
  if (!h) return out;
  for (const [k, v] of Object.entries(h)) out[String(k).toLowerCase()] = String(v);
  return out;
}

function pickHeaderSubset(h) {
  const keep = [
    "server", "cf-ray", "cf-mitigated", "location", "content-type",
    "x-robots-tag", "via", "x-cache", "x-served-by",
    "x-sucuri-id", "x-sucuri-cache", "x-akamai-transformed", "x-datadome"
  ];
  const subset = {};
  for (const k of keep) if (h[k] !== undefined) subset[k] = h[k];
  return subset;
}

function looksLikeChallengeUrl(urlLower) {
  const u = String(urlLower || "");
  return (
    u.includes("/challenge") ||
    u.includes("/checkpoint") ||
    u.includes("cdn-cgi/challenge") ||
    u.includes("cdn-cgi/") ||
    u.includes("/captcha") ||
    u.includes("turnstile") ||
    u.includes("perimeterx") ||
    u.includes("px-captcha")
  );
}

function detectPasswordWall(finalUrlLower, htmlLower) {
  const signals = [];
  if (String(finalUrlLower || "").includes("/password")) signals.push("URL_PASSWORD");
  const patterns = [
    "this store is protected with a password",
    "enter store using password",
    "enter password",
    "storefront password"
  ];
  for (const p of patterns) if (htmlLower.includes(p)) signals.push("DOM_" + p.replace(/[^a-z0-9]+/g, "_").toUpperCase());
  return { isLikely: signals.length > 0, signals };
}

function detectGeoblock(status, htmlLower) {
  if (status === 451) return { isLikely: true, signals: ["HTTP_451"] };
  const patterns = [
    "not available in your country",
    "not available in your region",
    "unavailable in your region",
    "access from your location",
    "due to regional restrictions"
  ];
  const signals = [];
  for (const p of patterns) if (htmlLower.includes(p)) signals.push("DOM_" + p.replace(/[^a-z0-9]+/g, "_").toUpperCase());
  return { isLikely: signals.length > 0, signals };
}

function detectBotMitigation(status, headers, htmlLower, finalUrlLower) {
  const signals = [];

  if (status === 403) signals.push("HTTP_403");
  if (status === 429) signals.push("HTTP_429");

  if (headers["server"] && headers["server"].toLowerCase().includes("cloudflare")) signals.push("HDR_SERVER_CLOUDFLARE");
  if (headers["cf-ray"]) signals.push("HDR_CF_RAY");
  if (headers["cf-mitigated"]) signals.push("HDR_CF_MITIGATED");
  if (headers["x-datadome"]) signals.push("HDR_DATADOME");
  if (headers["x-sucuri-id"] || headers["x-sucuri-cache"]) signals.push("HDR_SUCURI");
  if (headers["x-akamai-transformed"]) signals.push("HDR_AKAMAI");

  if (looksLikeChallengeUrl(finalUrlLower)) signals.push("URL_CHALLENGE_REDIRECT");

  const patterns = [
    "cf-turnstile", "cloudflare", "just a moment", "checking your browser",
    "captcha", "hcaptcha", "g-recaptcha", "datadome", "perimeterx", "px-captcha",
    "akamai", "incapsula", "sucuri", "verify you are human", "are you a robot", "attention required"
  ];
  for (const p of patterns) if (htmlLower.includes(p)) signals.push("DOM_" + p.replace(/[^a-z0-9]+/g, "_").toUpperCase());

  const isLikely = signals.length > 0 && (
    status === 403 || status === 429 || signals.includes("URL_CHALLENGE_REDIRECT") || signals.some(s => s.startsWith("DOM_"))
  );

  return { isLikely, signals };
}

async function safePageContent(page) {
  try { return (await page.content()) || ""; } catch { return ""; }
}

function parseArg(argv, flag) {
  const i = argv.indexOf(flag);
  if (i === -1) return null;
  const v = argv[i + 1];
  return (!v || String(v).startsWith("--")) ? null : String(v);
}

function loadProvisionedLane(explicitPath, outDir) {
  const candidates = [];
  if (explicitPath) candidates.push(explicitPath);
  candidates.push(path.join(outDir, "provision.json"));

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf8");
        const data = JSON.parse(raw);
        return { source: path.basename(p), data };
      }
    } catch {
      return null;
    }
  }
  return null;
}

function schemeFromUrl(u) {
  try { return new URL(u).protocol.replace(":", "").toLowerCase(); } catch { return ""; }
}

function hostFromUrl(targetUrl) {
  try { return new URL(targetUrl).hostname.toLowerCase(); } catch { return ""; }
}

function cookieHost(c) {
  try {
    if (c && c.url) return new URL(c.url).hostname.toLowerCase();
  } catch {}
  return "";
}

function isHostSuffixMatch(cookieDomain, targetHost) {
  const cd = String(cookieDomain || "").toLowerCase().replace(/^\./, "");
  const th = String(targetHost || "").toLowerCase();
  if (!cd || !th) return false;
  return th === cd || th.endsWith("." + cd);
}

function isValidCookiePath(p) {
  if (p === undefined || p === null || p === "") return true;
  return typeof p === "string" && p.startsWith("/");
}

function filterCookiesForTarget(cookies, targetUrl) {
  const th = hostFromUrl(targetUrl);
  const scheme = schemeFromUrl(targetUrl);

  const accepted = [];
  const rejected = [];

  for (const c of (Array.isArray(cookies) ? cookies : [])) {
    const name = c && c.name ? String(c.name) : "unknown";

    if (!isValidCookiePath(c && c.path)) {
      rejected.push({ name, reason: "COOKIE_PATH_INVALID" });
      continue;
    }

    if (scheme === "http" && c && c.secure === true) {
      rejected.push({ name, reason: "COOKIE_SECURE_ON_HTTP_TARGET" });
      continue;
    }

    const d = c && c.domain ? String(c.domain) : "";
    const ch = cookieHost(c);

    if (ch) {
      if (ch === th || ch.endsWith("." + th) || th.endsWith("." + ch)) accepted.push(c);
      else rejected.push({ name, reason: "COOKIE_URL_HOST_MISMATCH" });
      continue;
    }

    if (d) {
      if (isHostSuffixMatch(d, th)) accepted.push(c);
      else rejected.push({ name, reason: "COOKIE_DOMAIN_MISMATCH" });
      continue;
    }

    accepted.push(c);
  }

  return { accepted, rejected };
}

module.exports = Object.freeze({
  getForensicStamp,
  sha256Utf8,
  normalizeHeaders,
  pickHeaderSubset,
  detectPasswordWall,
  detectGeoblock,
  detectBotMitigation,
  safePageContent,
  parseArg,
  loadProvisionedLane,
  filterCookiesForTarget
});
