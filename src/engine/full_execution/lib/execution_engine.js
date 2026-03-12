const { chromium, devices } = require('playwright');

/**
 * FullExecutionEngine
 * Represents the real mechanical capture pipeline executing live browser automation
 * to return actual Buffer and JSON evaluation artifacts.
 */
class FullExecutionEngine {
    static async run(matterId, targetUrl = "https://example.com") {
        const browser = await chromium.launch({ headless: true });

        try {
            // Context 1: Desktop Baseline
            const desktopContext = await browser.newContext();
            const desktopPage = await desktopContext.newPage();
            const desktopStart = Date.now();
            await desktopPage.goto(targetUrl, { waitUntil: 'networkidle' });

            // Generate real screenshot buffer bytes
            const desktopScreenshotBuffer = await desktopPage.screenshot({ fullPage: true });

            // Execute real in-browser DOM analysis for findings payload
            const desktopFindings = await desktopPage.evaluate(() => {
                return {
                    context: "desktop_baseline",
                    title: document.title,
                    landmarkCount: document.querySelectorAll('main, nav, header, footer, aside, section, form').length,
                    linkCount: document.querySelectorAll('a[href]').length,
                    buttonCount: document.querySelectorAll('button').length
                };
            });
            const desktopEnd = Date.now();

            // Context 2: Mobile Baseline
            const mobileDevice = devices['Pixel 5'];
            const mobileContext = await browser.newContext({ ...mobileDevice });
            const mobilePage = await mobileContext.newPage();
            const mobileStart = Date.now();
            await mobilePage.goto(targetUrl, { waitUntil: 'networkidle' });

            // Generate real screenshot buffer bytes
            const mobileScreenshotBuffer = await mobilePage.screenshot({ fullPage: true });

            // Execute real in-browser DOM analysis
            const mobileFindings = await mobilePage.evaluate(() => {
                return {
                    context: "mobile_baseline",
                    title: document.title,
                    landmarkCount: document.querySelectorAll('main, nav, header, footer, aside, section, form').length,
                    linkCount: document.querySelectorAll('a[href]').length,
                    buttonCount: document.querySelectorAll('button').length
                };
            });
            const mobileEnd = Date.now();

            // Compile the aggregated execution metadata
            const summaryData = {
                matter_id: matterId,
                target_url: targetUrl,
                contexts_executed: ["desktop_baseline", "mobile_baseline"],
                pages_scanned: 2,
                total_time_ms: (desktopEnd - desktopStart) + (mobileEnd - mobileStart)
            };

            const findingsData = {
                matter_id: matterId,
                evaluations: [desktopFindings, mobileFindings]
            };

            // Return strictly formatted artifact definitions for the assembler
            return {
                artifacts: [
                    {
                        section: "01_Report",
                        filename: "accessibility_findings.json",
                        buffer: JSON.stringify(findingsData, null, 2),
                        type: "json"
                    },
                    {
                        section: "01_Report",
                        filename: "page_scan_summary.json",
                        buffer: JSON.stringify(summaryData, null, 2),
                        type: "json"
                    },
                    {
                        section: "02_Exhibits/desktop_baseline",
                        filename: "homepage.png",
                        buffer: desktopScreenshotBuffer,
                        type: "png"
                    },
                    {
                        section: "02_Exhibits/mobile_baseline",
                        filename: "homepage.png",
                        buffer: mobileScreenshotBuffer,
                        type: "png"
                    }
                ]
            };

        } finally {
            await browser.close();
        }
    }
}

module.exports = FullExecutionEngine;
