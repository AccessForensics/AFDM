/**
 * SECTION 10.3: TEMPORAL LOGGING
 */
async function logForensicEnvironment(context, browser, label) {
  const page = await context.newPage();
  const environment = {
    timestamp:         new Date().toISOString(),
    playwrightVersion: require('playwright/package.json').version,
    engineRevision:    browser.version(),
    userAgent:         await page.evaluate(() => navigator.userAgent),
    viewport:          context.viewportSize(),
    label:             label
  };
  console.log('[AFDM-ENVIRONMENT-LOG]: ' + JSON.stringify(environment));
  await page.close();
}

module.exports = { logForensicEnvironment };
