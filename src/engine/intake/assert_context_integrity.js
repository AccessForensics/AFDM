'use strict';

async function assertContextIntegrity(page, expectedContext) {
  if (!page || typeof page.viewportSize !== 'function') {
    throw new Error('CONTEXT_INTEGRITY: invalid page handle');
  }
  if (!expectedContext || typeof expectedContext !== 'object') {
    throw new Error('CONTEXT_INTEGRITY: expectedContext missing');
  }
  const vp = page.viewportSize();
  const dpr = await page.evaluate(() => window.devicePixelRatio);

  const expW = expectedContext.width;
  const expH = expectedContext.height;
  const expD = expectedContext.deviceScaleFactor;

  if (vp.width !== expW) {
    throw new Error(`CONTEXT_INTEGRITY: width expected ${expW}, got ${vp.width}`);
  }
  if (vp.height !== expH) {
    throw new Error(`CONTEXT_INTEGRITY: height expected ${expH}, got ${vp.height}`);
  }
  if (dpr !== expD) {
    throw new Error(`CONTEXT_INTEGRITY: dpr expected ${expD}, got ${dpr}`);
  }
  return true;
}

module.exports = { assertContextIntegrity };