'use strict';

const OUTCOME_LABELS = Object.freeze([
  'Observed as asserted',
  'Not observed as asserted',
  'Constrained',
  'Insufficiently specified for bounded execution'
]);
const OUTCOME_SET = new Set(OUTCOME_LABELS);

const QUALIFYING_OUTCOMES = Object.freeze([
  'Observed as asserted',
  'Not observed as asserted'
]);
const QUALIFYING_SET = new Set(QUALIFYING_OUTCOMES);

const NOTES_ALLOWED_OUTCOMES = Object.freeze([
  'Constrained',
  'Insufficiently specified for bounded execution'
]);
const NOTES_ALLOWED_SET = new Set(NOTES_ALLOWED_OUTCOMES);

const NOTES_ALLOWED_DETERMINATIONS = Object.freeze([
  'Eligible for Desktop browser forensic verification'
]);

const CONSTRAINT_CLASSES = Object.freeze([
  'AUTHWALL', 'BOTMITIGATION', 'GEOBLOCK', 'HARDCRASH', 'NAVIMPEDIMENT'
]);
const CONSTRAINT_SET = new Set(CONSTRAINT_CLASSES);

const DETERMINATION_CATEGORIES = Object.freeze([
  'Eligible for Desktop and Mobile browser forensic verification',
  'Eligible for Desktop browser forensic verification',
  'Not eligible for forensic verification',
  'Not eligible for forensic verification - constraints'
]);

const BANNED_WORDS = Object.freeze([
  'pass', 'fail', 'compliant', 'non-compliant', 'noncompliant',
  'violation', 'remediation', 'certification', 'legal opinion', 'audit'
]);

const RUN_CAP               = 10;
const SUFFICIENCY_THRESHOLD = 2;
const NOTE_MAX_LENGTH       = 160;

function validateOutcome(label) {
  if (!OUTCOME_SET.has(label)) {
    throw new Error('INVALID_OUTCOME: "' + label + '" is not in the locked outcome label set.');
  }
  return label;
}

function validateConstraintClass(cls) {
  if (!CONSTRAINT_SET.has(cls)) return null;
  return cls;
}

function containsBannedWord(text) {
  const lower = String(text || '').toLowerCase();
  for (const w of BANNED_WORDS) {
    const re = new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    if (re.test(lower)) return w;
  }
  return null;
}

module.exports = {
  OUTCOME_LABELS, OUTCOME_SET,
  QUALIFYING_OUTCOMES, QUALIFYING_SET,
  NOTES_ALLOWED_OUTCOMES, NOTES_ALLOWED_SET, NOTES_ALLOWED_DETERMINATIONS,
  CONSTRAINT_CLASSES, CONSTRAINT_SET,
  DETERMINATION_CATEGORIES,
  BANNED_WORDS,
  RUN_CAP, SUFFICIENCY_THRESHOLD, NOTE_MAX_LENGTH,
  validateOutcome, validateConstraintClass, containsBannedWord
};
