'use strict';

const BANNED_PHRASES = [
  "extensive testing",
  "limited testing",
  "we checked everything",
  "we checked only a few",
  "thorough review",
  "comprehensive",
  "in-depth",
  "we tested",
  "we found",
  "we confirmed",
  "number of",
  "several conditions",
  "multiple issues",
  "all conditions",
  "no issues",
  "pass",
  "fail",
  "compliant",
  "non-compliant",
  "violation",
  "audit",
  "certification",
  "guarantee",
  "likely",
  "unlikely",
  "probably",
  "appears to",
  "seems to",
  "provisionally",
  "strongly",
  "weakly"
];

function lintDeterminationOutput(text, matterId) {
  const safeText = (text ?? '').toString();
  const lower = safeText.toLowerCase();
  const mid = (matterId ?? 'UNKNOWN').toString();

  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) {
      throw new Error(`NON_DISCLOSURE_LINT [${mid}]: Banned phrase detected in determination output: "${phrase}"`);
    }
  }
  return true;
}

module.exports = { BANNED_PHRASES, lintDeterminationOutput };