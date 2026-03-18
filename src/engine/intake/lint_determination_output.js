"use strict";

const fs = require("fs");
const path = require("path");
const { TEMPLATE_VALUES, BANNED_WORDS } = require("./enums.js");

const LOCKED_TEMPLATE_SET = new Set(TEMPLATE_VALUES);

function assertLockedDeterminationTemplate(template) {
  if (!LOCKED_TEMPLATE_SET.has(template)) {
    throw new Error(`INVALID_DETERMINATION_TEMPLATE: ${template}`);
  }
  return true;
}

function lintDeterminationOutput(text, matterId) {
  const safeText = String(text || "");
  const lower = safeText.toLowerCase();
  const safeMatterId = String(matterId || "UNKNOWN");

  for (const phrase of BANNED_WORDS) {
    if (lower.includes(String(phrase).toLowerCase())) {
      throw new Error(`NON_DISCLOSURE_LINT [${safeMatterId}]: banned phrase detected: ${phrase}`);
    }
  }

  const match = safeText.match(/DETERMINATION:[^\r\n"]+/);
  if (match) {
    assertLockedDeterminationTemplate(match[0].trim());
  }

  return true;
}

function readCurrentTemplatesFile() {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const templatePath = path.join(repoRoot, "AFintaketemplates1-8.md");
  return fs.readFileSync(templatePath, "utf8").replace(/^\uFEFF/, "");
}

module.exports = {
  assertLockedDeterminationTemplate,
  lintDeterminationOutput,
  readCurrentTemplatesFile,
};