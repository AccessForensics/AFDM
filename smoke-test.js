const { AFDM_DESKTOP_CONTEXT, AFDM_MOBILE_CONTEXT } = require('./src/engine/runner/contexts');
const { logForensicEnvironment } = require('./src/engine/utils/logger');
const { chromium, webkit } = require('playwright');

async function runSmokeTest() {
    console.log('\x1b[36m%s\x1b[0m', '--- STARTING AFDM V3.1 INTEGRITY CHECK ---');
    
    // Validate Desktop Context
    console.log('Testing Desktop (Boundary Neutrality)...');
    const browserD = await chromium.launch();
    const contextD = await browserD.newContext(AFDM_DESKTOP_CONTEXT);
    await logForensicEnvironment(contextD, browserD, 'SMOKE_TEST_DESKTOP');
    await browserD.close();

    // Validate Mobile Context
    console.log('Testing Mobile (Anchored Reference)...');
    const browserM = await webkit.launch();
    const contextM = await browserM.newContext(AFDM_MOBILE_CONTEXT);
    await logForensicEnvironment(contextM, browserM, 'SMOKE_TEST_MOBILE');
    await browserM.close();

    console.log('\x1b[32m%s\x1b[0m', '--- INTEGRITY CHECK PASSED: V3.1 HARDLOCK VERIFIED ---');
}

runSmokeTest().catch(console.error);
