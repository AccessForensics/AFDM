const path = require('path');

/**
 * SECTION 10.3: TEMPORAL LOGGING
 * Corrected: viewportSize() is called on page, not context.
 */
async function logForensicEnvironment(context, browser, label) {
  const page = await context.newPage();
  const environment = {
    timestamp:         new Date().toISOString(),
    playwrightVersion: require('playwright/package.json').version,
    engineRevision:    browser.version(),
    userAgent:         await page.evaluate(() => navigator.userAgent),
    viewport:          page.viewportSize(), // Fixed: called on page
    dpr:               await page.evaluate(() => window.devicePixelRatio),
    label:             label
  };
  console.log('[AFDM-ENVIRONMENT-LOG]: ' + JSON.stringify(environment));
  await page.close();
}

module.exports = { logForensicEnvironment };
