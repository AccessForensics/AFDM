'use strict';
const { NOTES_ALLOWED_SET, NOTE_MAX_LENGTH } = require('./enums.js');

function validateNote(outcome, noteText, isDeterminationDesktopOnly) {
  const result      = { valid: false, reason: null, sanitized: null };
  const noteAllowed = NOTES_ALLOWED_SET.has(outcome) || isDeterminationDesktopOnly === true;

  if (!noteAllowed) {
    if (noteText && String(noteText).trim().length > 0) {
      result.reason = 'NOTE_PROHIBITED: notes not allowed for outcome "' + outcome + '"';
      return result;
    }
    return { valid: true, sanitized: null };
  }

  const trimmed = noteText ? String(noteText).trim() : '';
  if (!trimmed) return { valid: true, sanitized: null };

  if (trimmed.length > NOTE_MAX_LENGTH) {
    result.reason = 'NOTE_TOO_LONG: ' + trimmed.length + ' chars exceeds ' + NOTE_MAX_LENGTH + ' limit.';
    return result;
  }

  if (/[\r\n]/.test(trimmed)) {
    result.reason = 'NOTE_MULTI_LINE: notes must be a single line.';
    return result;
  }

  if ((trimmed.match(/\./g) || []).length > 1) {
    result.reason = 'NOTE_MULTI_SENTENCE: found ' + (trimmed.match(/\./g) || []).length + ' periods, max is 1.';
    return result;
  }

  return { valid: true, sanitized: trimmed };
}

function isNoteDisabled(outcome) {
  return !NOTES_ALLOWED_SET.has(outcome);
}

module.exports = { validateNote, isNoteDisabled };
