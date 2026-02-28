const { chromium, webkit, devices } = require('playwright');

/**
 * SECTION 8: EXECUTION CONTEXT RIGOR [cite: 8]
 * Desktop: 1366x900 (Locked baseline)
 * Mobile: 390x844 (Anchored Only)
 */
const AFDM_DESKTOP_CONTEXT = {
  viewport:          { width: 1366, height: 900 },
  deviceScaleFactor: 1,
  isMobile:          false,
  hasTouch:          false,
};

const AFDM_MOBILE_CONTEXT = {
  ...devices['iPhone 14'],
};

module.exports = { AFDM_DESKTOP_CONTEXT, AFDM_MOBILE_CONTEXT };

