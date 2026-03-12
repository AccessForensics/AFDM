'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveTemplate } = require('../src/engine/intake/template_resolver.js');
const { ENUMS } = require('../src/engine/intake/locked.js');

test('Template Resolution: T1_DUAL resolves to desktop/mobile eligible template', () => {
  const result = resolveTemplate(ENUMS.DETERMINATION_TEMPLATE.T1_DUAL);
  assert.ok(result.includes('ELIGIBLE FOR DESKTOP AND MOBILE TECHNICAL RECORD BUILD'), 'Missing expected T1 text');
});

test('Template Resolution: T2_DESKTOP resolves to desktop eligible template', () => {
  const result = resolveTemplate(ENUMS.DETERMINATION_TEMPLATE.T2_DESKTOP);
  assert.ok(result.includes('ELIGIBLE FOR DESKTOP TECHNICAL RECORD BUILD'), 'Missing expected T2 text');
  assert.ok(!result.includes('AND MOBILE'), 'Should not include mobile');
});

test('Template Resolution: T4_NOT_ELIGIBLE resolves to not eligible template', () => {
  const result = resolveTemplate(ENUMS.DETERMINATION_TEMPLATE.T4_NOT_ELIGIBLE);
  assert.ok(result.includes('NOT ELIGIBLE FOR FORENSIC EXECUTION'), 'Missing expected T4 text');
  assert.ok(!result.includes('CONSTRAINTS'), 'Should not include constraints logic');
});

test('Template Resolution: T5 resolves to NOT_ELIGIBLE_CONSTRAINTS with BOTMITIGATION inserted', () => {
  const result = resolveTemplate(ENUMS.DETERMINATION_TEMPLATE.T5_NOT_ELIGIBLE_CONSTRAINTS_BOTMITIGATION, 'BOTMITIGATION');
  assert.ok(result.includes('NOT ELIGIBLE FOR FORENSIC EXECUTION - CONSTRAINTS'), 'Missing expected T5 header');
  assert.ok(result.includes('CONSTRAINT CLASS: BOTMITIGATION'), 'Missing constraint class injection');
});

test('Template Resolution: T6 resolves to NOT_ELIGIBLE_CONSTRAINTS with alternate class inserted', () => {
  const result = resolveTemplate(ENUMS.DETERMINATION_TEMPLATE.T6_NOT_ELIGIBLE_CONSTRAINTS_OTHER, 'AUTHWALL');
  assert.ok(result.includes('NOT ELIGIBLE FOR FORENSIC EXECUTION - CONSTRAINTS'), 'Missing expected T6 header');
  assert.ok(result.includes('CONSTRAINT CLASS: AUTHWALL'), 'Missing alternate constraint class injection');
});

test('Template Resolution: T3_DESKTOP_MOBILE_CONSTRAINED hard-fails with required doctrine gap message', () => {
  assert.throws(
    () => { resolveTemplate(ENUMS.DETERMINATION_TEMPLATE.T3_DESKTOP_MOBILE_CONSTRAINED); },
    /Missing canonical determination template for T3_DESKTOP_MOBILE_CONSTRAINED. AFIntakeTemplate.pdf provides no approved text for this state. Refusing to synthesize non-canonical determination content./,
    'T3 must throw the exact required error message'
  );
});
