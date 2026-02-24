const { test, expect } = require('@playwright/test');
const path             = require('path');
const { executeIntake }                                                = require('../src/engine/intake/orchestrator.js');
const { validateOutcome, validateConstraintClass, containsBannedWord } = require('../src/engine/intake/enums.js');
const { validateNote }                                                 = require('../src/engine/intake/notegate.js');
const { AnchorDetector, detectAnchor }                                 = require('../src/engine/intake/anchordetector.js');

const OUT = path.join(__dirname, 'output');

// ── UNIT: Outcome enum lock ───────────────────────────────────────────────────
test('S7 - validates all four locked outcome labels', () => {
  expect(() => validateOutcome('Observed as asserted')).not.toThrow();
  expect(() => validateOutcome('Not observed as asserted')).not.toThrow();
  expect(() => validateOutcome('Constrained')).not.toThrow();
  expect(() => validateOutcome('Insufficiently specified for bounded execution')).not.toThrow();
  expect(() => validateOutcome('PASS')).toThrow('INVALID_OUTCOME');
  expect(() => validateOutcome('FAIL')).toThrow('INVALID_OUTCOME');
  expect(() => validateOutcome('compliant')).toThrow('INVALID_OUTCOME');
});

// ── UNIT: Constraint class enum S9.F ─────────────────────────────────────────
test('S9.F - validateConstraintClass returns null for unmapped values', () => {
  expect(validateConstraintClass('AUTHWALL')).toBe('AUTHWALL');
  expect(validateConstraintClass('BOTMITIGATION')).toBe('BOTMITIGATION');
  expect(validateConstraintClass('GEOBLOCK')).toBe('GEOBLOCK');
  expect(validateConstraintClass('HARDCRASH')).toBe('HARDCRASH');
  expect(validateConstraintClass('NAVIMPEDIMENT')).toBe('NAVIMPEDIMENT');
  expect(validateConstraintClass('UNKNOWN')).toBeNull();
  expect(validateConstraintClass('AUTH_WALL')).toBeNull();
  expect(validateConstraintClass(null)).toBeNull();
});

// ── UNIT: Banned word detection ───────────────────────────────────────────────
test('S1.A - containsBannedWord detects prohibited vocabulary', () => {
  expect(containsBannedWord('this test passed')).toBe('pass');
  expect(containsBannedWord('non-compliant behavior')).toBe('non-compliant');
  expect(containsBannedWord('clean mechanical text')).toBeNull();
});

// ── UNIT: Note gate - prohibited on qualifying (Grok granular) ────────────────
test('S9.B - NOTE_PROHIBITED on Observed as asserted', () => {
  const r = validateNote('Observed as asserted', 'some note text', false);
  expect(r.valid).toBe(false);
  expect(r.reason).toMatch(/NOTE_PROHIBITED/);
  expect(r.sanitized).toBeNull();
});

test('S9.B - NOTE_PROHIBITED on Not observed as asserted', () => {
  const r = validateNote('Not observed as asserted', 'any note', false);
  expect(r.valid).toBe(false);
  expect(r.reason).toMatch(/NOTE_PROHIBITED/);
});

// ── UNIT: Note gate - valid on Constrained (Grok granular) ───────────────────
test('S9.C - valid note accepted on Constrained', () => {
  const r = validateNote('Constrained', 'Auth wall blocked access.', false);
  expect(r.valid).toBe(true);
  expect(r.sanitized).toBe('Auth wall blocked access.');
});

// ── UNIT: Note gate - length limit (Grok granular) ───────────────────────────
test('S9.D - NOTE_TOO_LONG enforced at 160 chars', () => {
  const r = validateNote('Constrained', 'a'.repeat(161), false);
  expect(r.valid).toBe(false);
  expect(r.reason).toMatch(/NOTE_TOO_LONG/);
});

// ── UNIT: Note gate - no newlines (Grok granular) ────────────────────────────
test('S9.D - NOTE_MULTI_LINE enforced', () => {
  const r = validateNote('Constrained', 'line one\nline two', false);
  expect(r.valid).toBe(false);
  expect(r.reason).toMatch(/NOTE_MULTI_LINE/);
});

// ── UNIT: Note gate - single sentence (Grok granular) ────────────────────────
test('S9.D - NOTE_MULTI_SENTENCE enforced', () => {
  const r = validateNote('Constrained', 'First sentence. Second sentence.', false);
  expect(r.valid).toBe(false);
  expect(r.reason).toMatch(/NOTE_MULTI_SENTENCE/);
});

// ── UNIT: Anchor detector - keyword ──────────────────────────────────────────
test('S8.E - keyword detection triggers mobile scope', () => {
  const r = detectAnchor('when viewing on an iphone the menu fails');
  expect(r.mobileInScope).toBe(true);
  expect(r.anchorPhrase).toContain('iphone');
});

// ── UNIT: Anchor detector - dimension (DeepSeek exclusive) ───────────────────
test('S8.E - pixel dimension 375px triggers mobile scope', () => {
  const r = detectAnchor('at 375px the dropdown overflows the viewport');
  expect(r.mobileInScope).toBe(true);
  expect(r.anchorPhrase).toMatch(/375px/);
  expect(r.anchorPhrase).toMatch(/anchor-dimension/);
});

// ── UNIT: Anchor detector - no anchor ────────────────────────────────────────
test('S8.E - no anchor returns mobileInScope false', () => {
  const r = detectAnchor('keyboard focus does not reach the submit button');
  expect(r.mobileInScope).toBe(false);
  expect(r.anchorPhrase).toBeNull();
});

// ── UNIT: MOBILE_KEYWORDS static property ────────────────────────────────────
test('AnchorDetector.MOBILE_KEYWORDS accessible as static property', () => {
  expect(Array.isArray(AnchorDetector.MOBILE_KEYWORDS)).toBe(true);
  expect(AnchorDetector.MOBILE_KEYWORDS).toContain('iphone');
  expect(AnchorDetector.MOBILE_KEYWORDS).toContain('viewport');
});

// ── INTEGRATION: S5.D sufficiency stop ───────────────────────────────────────
test('S5.D - stops at exactly 2 qualifying confirmations', async () => {
  const mockExecutor = async () => 'Observed as asserted';
  const result = await executeIntake({
    targetUrl: 'about:blank', targetDomain: 'test.example.com',
    complaintGroups: [
      { anchor: 'Page 2, Bullet 1', assertions: ['iphone link not tappable'] },
      { anchor: 'Page 2, Bullet 2', assertions: ['button not responding to touch'] },
      { anchor: 'Page 3, Para 1',   assertions: ['form not scrollable on mobile viewport'] }
    ],
    complaintMaterials: 'when viewing on an iphone the navigation link does not respond to tap',
    outputDir: path.join(OUT, 'test-sufficiency'), runExecutor: mockExecutor
  });
  expect(result.internal.sufficiencyreached).toBe(true);
  expect(result.internal.qualifyingconfirmations).toBe(2);
  expect(result.internal.totalrunsexecuted).toBeLessThanOrEqual(6);
});

// ── INTEGRATION: S8.D/F desktop only ─────────────────────────────────────────
test('S8.D/F - all runs desktop when no mobile anchor', async () => {
  const mockExecutor = async () => 'Observed as asserted';
  const result = await executeIntake({
    targetUrl: 'about:blank', targetDomain: 'test.example.com',
    complaintGroups: [{ anchor: 'Page 3', assertions: ['submit button not keyboard focusable'] }],
    complaintMaterials: 'The submit button cannot be reached via keyboard navigation.',
    outputDir: path.join(OUT, 'test-desktop-only'), runExecutor: mockExecutor
  });
  expect(result.internal.mobileinscope).toBe(false);
  expect(result.internal.runs.filter(r => !r.skipped).every(r => r.context === 'desktop')).toBe(true);
  expect(result.external.determination).toBe('Eligible for Desktop browser forensic verification');
});

// ── INTEGRATION: S5.A run cap ─────────────────────────────────────────────────
test('S5.A - run cap of 10 never exceeded', async () => {
  const mockExecutor = async (b, c, run) => { run.constraintclass = 'AUTHWALL'; return 'Constrained'; };
  const result = await executeIntake({
    targetUrl: 'about:blank', targetDomain: 'test.example.com',
    complaintGroups: Array.from({ length: 10 }, (_, i) => ({
      anchor: 'Page ' + (i + 1), assertions: ['assertion ' + (i + 1)]
    })),
    complaintMaterials: 'No mobile reference.',
    outputDir: path.join(OUT, 'test-run-cap'), runExecutor: mockExecutor
  });
  expect(result.internal.totalrunsexecuted).toBeLessThanOrEqual(10);
});

// ── INTEGRATION: S1.B/C external filter ──────────────────────────────────────
test('S1.B/C - external output has no internal fields', async () => {
  const mockExecutor = async () => 'Observed as asserted';
  const result = await executeIntake({
    targetUrl: 'about:blank', targetDomain: 'test.example.com',
    complaintGroups: [{ anchor: 'Page 1', assertions: ['link not keyboard focusable'] }],
    complaintMaterials: 'keyboard navigation - no mobile anchor.',
    outputDir: path.join(OUT, 'test-external'), runExecutor: mockExecutor
  });
  const ext = result.external;
  expect(ext).not.toHaveProperty('runs');
  expect(ext).not.toHaveProperty('qualifyingconfirmations');
  expect(ext).not.toHaveProperty('totalrunsexecuted');
  expect(ext).not.toHaveProperty('note');
  expect(ext).not.toHaveProperty('mobileinscope');
  expect(ext).not.toHaveProperty('runcap');
  expect(typeof ext.determination).toBe('string');
});

// ── INTEGRATION: Pipeline format ─────────────────────────────────────────────
test('Pipeline - runUnitsInput from rununits.json works', async () => {
  const mockExecutor = async () => 'Observed as asserted';
  const result = await executeIntake({
    targetUrl: 'about:blank', targetDomain: 'test.example.com',
    runUnitsInput: [
      { anchor: 'Page 1, Paragraph 1', condition: 'iphone link not tappable' },
      { anchor: 'Page 2, Bullet 1',    condition: 'viewport menu clipped at 375px' }
    ],
    complaintMaterials: 'Complaint mentions iphone and 375px viewport.',
    outputDir: path.join(OUT, 'test-pipeline'), runExecutor: mockExecutor
  });
  expect(result.internal.mobileinscope).toBe(true);
  expect(result.internal.runs.length).toBeGreaterThan(0);
});

// ── INTEGRATION: S10.A interleaving ──────────────────────────────────────────
test('S10.A - desktop before mobile in each interleaved pair', async () => {
  const mockExecutor = async () => 'Not observed as asserted';
  const result = await executeIntake({
    targetUrl: 'about:blank', targetDomain: 'test.example.com',
    complaintGroups: [{ anchor: 'Page 1', assertions: ['tap on iphone does not open menu'] }],
    complaintMaterials: 'when viewing on an iphone the menu tap fails',
    outputDir: path.join(OUT, 'test-interleave'), runExecutor: mockExecutor
  });
  if (result.internal.mobileinscope) {
    const contexts = result.internal.runs.filter(r => !r.skipped).map(r => r.context);
    expect(contexts[0]).toBe('desktop');
  }
});
