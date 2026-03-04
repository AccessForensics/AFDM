// Pull locked context options from canonical intake context builder (allowlisted).
const contextFactory = require('./src/engine/intake/contextfactory.js');

const { logForensicEnvironment } = require('./src/engine/utils/logger');
const { chromium, webkit } = require('playwright');

async function runSmokeTest() {
  console.log('\x1b[36m%s\x1b[0m', '--- STARTING AFDM V3.1 INTEGRITY CHECK ---');

  // Validate Desktop Context
  console.log('Testing Desktop (Boundary Neutrality)...');
  const browserD = await chromium.launch();
  try {
    const contextD = await browserD.newContext(contextFactory.getDesktopContextOptions());
    await logForensicEnvironment(contextD, browserD, 'SMOKE_TEST_DESKTOP');
    await contextD.close();
  } finally {
    await browserD.close();
  }

  // Validate Mobile Context
  console.log('Testing Mobile (Anchored Reference)...');
  const browserM = await webkit.launch();
  try {
    const contextM = await browserM.newContext(contextFactory.getMobileContextOptions());
    await logForensicEnvironment(contextM, browserM, 'SMOKE_TEST_MOBILE');
    await contextM.close();
  } finally {
    await browserM.close();
  }

  console.log('\x1b[32m%s\x1b[0m', '--- INTEGRITY CHECK PASSED: V3.1 HARDLOCK VERIFIED ---');
}

runSmokeTest().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
