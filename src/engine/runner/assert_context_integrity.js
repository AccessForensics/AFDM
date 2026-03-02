'use strict';

/**
 * Runtime Context Integrity Assertion (Full Execution)
 * Reads live viewport + DPR from the page and hard-fails on mismatch.
 * DPR expectation defaults to 1 when expectedContext.deviceScaleFactor is not provided.
 */
async function assertContextIntegrity(page, expectedContext) {
  if (!page) throw new Error('CONTEXT_INTEGRITY: page missing');
  if (!expectedContext) throw new Error('CONTEXT_INTEGRITY: expectedContext missing');

  const vp = page.viewportSize();
  const dpr = await page.evaluate(() => window.devicePixelRatio);

  if (!vp) throw new Error('CONTEXT_INTEGRITY: viewportSize unavailable');

  if (vp.width !== expectedContext.width) {
    throw new Error(`CONTEXT_INTEGRITY: width expected ${expectedContext.width}, got ${vp.width}`);
  }
  if (vp.height !== expectedContext.height) {
    throw new Error(`CONTEXT_INTEGRITY: height expected ${expectedContext.height}, got ${vp.height}`);
  }

  const expDpr = (expectedContext.deviceScaleFactor === undefined || expectedContext.deviceScaleFactor === null)
    ? 1
    : expectedContext.deviceScaleFactor;

  if (dpr !== expDpr) {
    throw new Error(`CONTEXT_INTEGRITY: dpr expected ${expDpr}, got ${dpr}`);
  }

  return true;
}

module.exports = { assertContextIntegrity };