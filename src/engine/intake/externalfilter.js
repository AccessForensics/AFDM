'use strict';
const { BANNED_WORDS } = require('./enums.js');

const PROHIBITED_FIELDS = new Set([
  'runcount', 'confirmationcount', 'capreached', 'capstatus',
  'observedcount', 'notobservedcount', 'sufficiencyreached',
  'rununitselection', 'runsequence', 'interleaveorder',
  'desktopexecutiondetail', 'mobileexecutiondetail',
  'note', 'notes', 'internalnote', 'tsstart', 'tsend',
  'qualifyingconfirmations', 'totalrunsexecuted',
  'mobileanchorphrase', 'mobileinscope',
  'runcap', 'runs'
]);

function filterForExternal(record) {
  if (!record || typeof record !== 'object') return record;
  const filtered = {};
  for (const key of Object.keys(record)) {
    if (PROHIBITED_FIELDS.has(key.toLowerCase())) continue;
    filtered[key] = record[key];
  }
  return filtered;
}

function scanForBannedVocabulary(text) {
  const found = [];
  const lower = String(text || '').toLowerCase();
  for (const w of BANNED_WORDS) {
    const re = new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    if (re.test(lower)) found.push(w);
  }
  return found;
}

function filterRunUnitsForExternal(runUnits) {
  return runUnits.map(ru => ({
    rununitid:            ru.rununitid,
    complaintgroupanchor: ru.complaintgroupanchor,
    assertedcondition:    ru.assertedcondition,
    outcome:              ru.outcome,
    context:              ru.context
  }));
}

module.exports = {
  filterForExternal,
  scanForBannedVocabulary,
  filterRunUnitsForExternal,
  PROHIBITED_FIELDS
};
