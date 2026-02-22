/**
 * SECTIONS 5, 7, 8, & 9: INTAKE VALIDATION GATE
 */
const SYSTEM_LIMITS = {
  RUN_CAP: 10,                 // Locked: Section 5 
  SUFFICIENCY_THRESHOLD: 2,    // Locked: Section 5 
  NOTE_MAX_LENGTH: 160         // Locked: Section 9.3
};

// Section 7 Outcome Labels [cite: 7]
const OUTCOME_LABELS = [
    'Observed as asserted', 
    'Not observed as asserted', 
    'Constrained', 
    'Insufficiently specified for bounded execution'
];

// Section 9.5 Constraint Classes
const CONSTRAINT_CLASSES = ['AUTH_WALL', 'BOT_MITIGATION', 'GEO_BLOCK', 'HARD_CRASH', 'NAV_IMPEDIMENT'];

/**
 * Section 8.2: Explicit Anchor Rule
 */
function validateMobileAnchor(materials) {
    const terms = ['mobile', 'phone', 'tablet', 'handheld', 'iphone', 'android', 'tap', 'swipe', 'pinch', 'safari', 'viewport'];
    return terms.some(t => materials.toLowerCase().includes(t));
}

module.exports = { SYSTEM_LIMITS, OUTCOME_LABELS, CONSTRAINT_CLASSES, validateMobileAnchor };
