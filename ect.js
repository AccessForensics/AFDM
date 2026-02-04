/**
 * SKU-A: Electronic Capture Tool (ect.js)
 * VERSION: 3.6.0-LOCKED
 * PATCH: HU-2.1 (Hardened)
 */

const { chromium } = require('playwright');
const fs = require('fs-extra');
const crypto = require('crypto');
const path = require('path');

class SKUAEngine {
    constructor(manifest) {
        this.manifest = manifest; 
        this.prevHash = manifest.hash || '00000000000000000000000000000000';
        this.allowedSelectors = new Set(manifest.allowed_selectors);
        this.denylist = new Set(['name', 'value', 'description', 'help', 'url', 'text', 'title', 'placeholder', 'ariaLabel']);
    }

    async initialize() {
        this.browser = await chromium.launch({ headless: true });
        const actualVersion = this.browser.version();
        
        // Toolchain Gate (TM-03) - Bypass logic for local lab verification
        if (this.manifest.toolchain_id !== 'bypass' && actualVersion !== this.manifest.toolchain_id) {
            console.error(`FATAL: TOOLCHAIN_MISMATCH | EXPECTED: ${this.manifest.toolchain_id} | ACTUAL: ${actualVersion}`);
            process.exit(10);
        }

        this.context = await this.browser.newContext({
            userAgent: "AccessForensics/SKU-A-Forensic-Observer/3.6",
            viewport: this.manifest.viewport
        });
        
        this.page = await this.context.newPage();

        await this.page.addInitScript(() => {
            window.__af_mutations = 0;
            const observer = new MutationObserver(() => window.__af_mutations++);
            observer.observe(document, { attributes: true, childList: true, subtree: true });
        });
    }

    /**
     * Hardened Settle Rule v2: Quiet State Detection
     * Monitors mutation velocity and ignores infinite decorative animations.
     */
    async waitForSettled(timeout = 10000) {
        const start = Date.now();
        let lastMutationCount = await this.page.evaluate(() => window.__af_mutations);
        
        while (Date.now() - start < timeout) {
            // Stability Detection Window (Forensic standard: 750ms)
            await new Promise(r => setTimeout(r, 750));
            
            const currentMutations = await this.page.evaluate(() => window.__af_mutations);
            const runningFiniteAnimations = await this.page.evaluate(() => 
                // We filter for running animations that have a finite end-state.
                // Infinite animations are classified as environmental noise.
                document.getAnimations().filter(a => 
                    a.playState === 'running' && 
                    a.effect && 
                    a.effect.getTiming().iterations !== Infinity
                ).length
            );
            
            // PASS CONDITION: 
            // 1. Mutations have ceased changing for the duration of the window.
            // 2. No finite (state-changing) animations are in progress.
            if (currentMutations === lastMutationCount && runningFiniteAnimations === 0) {
                return true;
            }
            
            lastMutationCount = currentMutations;
        }
        throw new Error("SETTLE_TIMEOUT");
    }

    _redactRecursive(node) {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
            node.forEach(item => this._redactRecursive(item));
        } else {
            for (const key of Object.keys(node)) {
                if (this.denylist.has(key)) {
                    node[key] = "[REDACTED_BY_MINIMIZATION_POLICY]";
                } else {
                    this._redactRecursive(node[key]);
                }
            }
        }
    }

    async captureStep(selector, interaction = "PASSIVE") {
        if (!this.allowedSelectors.has(selector)) {
            console.error(`SECURITY_ERROR: OUT_OF_SCOPE_SELECTOR | ${selector}`);
            process.exit(15);
        }

        await this.waitForSettled();

        const node = await this.page.$(selector);
        const axSnapshot = await this.page.accessibility.snapshot({ root: node });
        this._redactRecursive(axSnapshot);

        const telemetry = {
            timestamp: new Date().toISOString(),
            selector,
            interaction,
            ax_tree: axSnapshot,
            styles: await node.evaluate((el, props) => 
                props.reduce((a, p) => ({ ...a, [p]: getComputedStyle(el).getPropertyValue(p) }), {}), 
                this.manifest.css_allowlist || []
            )
        };

        this._logChained(telemetry);
    }

    _logChained(data) {
        const canonical = JSON.stringify(data, Object.keys(data).sort());
        const hash = crypto.createHash('sha256').update(this.prevHash + canonical).digest('hex');
        const entry = { prev_hash: this.prevHash, data, hash };
        this.prevHash = hash;
        fs.appendFileSync('journal.ndjson', JSON.stringify(entry) + '\n');
    }
}

module.exports = SKUAEngine;
