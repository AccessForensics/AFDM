/**
 * ACCESS FORENSICS | SHARED UTILITIES
 * Deterministic canonicalization helpers for hashing and token matching.
 *
 * NOTE: We intentionally do NOT truncate to 8 hex chars.
 * For forensic stability, env_hash uses 16 hex chars (64-bit) by default.
 */
const crypto = require("crypto");

function isPlainObject(x) {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function canonicalize(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = canonicalize(value[k]);
    return out;
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

/**
 * envRecord = { env_label, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent, ... }
 * returns hex string of length (bytes*2). default bytes=8 => 16 hex chars.
 */
function computeEnvHash(envRecord, bytes = 8) {
  const canonical = stableStringify(envRecord);
  return crypto.createHash("sha256").update(canonical).digest("hex").slice(0, bytes * 2);
}

/**
 * Canonical Token Normalization for Moat/Policy predicates
 */
function normalizeForTokenMatch(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = {
  canonicalize,
  stableStringify,
  computeEnvHash,
  normalizeForTokenMatch
};
