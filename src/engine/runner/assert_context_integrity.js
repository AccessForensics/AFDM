'use strict';

/**
 * Runtime Context Integrity Assertion (Full Execution)
 * Reads live viewport + DPR from the page and hard-fails on mismatch.
 *
 * Expected values are derived from the SAME ctxOpts object passed into browser.newContext(ctxOpts).
 * This eliminates drift between config intent and runtime assertion.
 */
async function assertContextIntegrity(page, ctxOpts) {
  if (!page) throw new Error('CONTEXT_INTEGRITY: page missing');
  if (!ctxOpts) throw new Error('CONTEXT_INTEGRITY: ctxOpts missing');

  const expectedViewport = ctxOpts.viewport;
  if (!expectedViewport || expectedViewport.width === undefined || expectedViewport.height === undefined) {
    throw new Error('CONTEXT_INTEGRITY: ctxOpts.viewport missing width/height');
  }

  const vp = page.viewportSize();
  const dpr = await page.evaluate(() => window.devicePixelRatio);

  if (!vp) throw new Error('CONTEXT_INTEGRITY: viewportSize unavailable');

  if (vp.width !== expectedViewport.width) {
    throw new Error(`CONTEXT_INTEGRITY: width expected ${expectedViewport.width}, got ${vp.width}`);
  }
  if (vp.height !== expectedViewport.height) {
    throw new Error(`CONTEXT_INTEGRITY: height expected ${expectedViewport.height}, got ${vp.height}`);
  }

  const expDpr = (ctxOpts.deviceScaleFactor === undefined || ctxOpts.deviceScaleFactor === null)
    ? 1
    : ctxOpts.deviceScaleFactor;

  if (dpr !== expDpr) {
    throw new Error(`CONTEXT_INTEGRITY: dpr expected ${expDpr}, got ${dpr}`);
  }

  return true;
}

module.exports = { assertContextIntegrity };