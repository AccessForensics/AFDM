const ENUMS = require('./intake/enums.js');
// S8.B/C + S10.C: Viewport lock + clean state (intake-enforcement-v1)
const AFDM_DESKTOP_VIEWPORT = (ENUMS.VIEWPORT ? ENUMS.VIEWPORT.DESKTOP : ENUMS.CONTEXTS.DESKTOP.viewport);
const AFDM_MOBILE_DEVICE    = 'iPhone 14'; // canonical viewport, DPR locked

const { chromium } = require('playwright');
const fs = require('fs-extra');
const crypto = require('crypto');
const path = require('path');

class SKUAEngine {
  constructor(manifest) {
    this.manifest = manifest || {};

    // PRESERVE: hash chaining is evidentiary, every event must be chainable.
    this.prevHash = this.manifest.hash || '00000000000000000000000000000000';

    // POLICY: Explicit Opt-In for unbounded capture.
    // LEGAL WHY: Prevents accidental "dragnet" collection. Operator must intentionally assert "capture everything".
    this.allowAllSelectors = Boolean(this.manifest.allow_all_selectors);

    // PRESERVE: interface evidence must be attributable to a scoped selector set.
    // LEGAL WHY: scope boundaries reduce accusations of over-collection.
    this.allowedSelectors = this._buildAllowedSelectorSet(this.manifest.allowed_selectors);

    // POLICY: default is non-fatal enforcement, strict mode is opt-in.
    // LEGAL WHY: a single unexpected selector must not void a session, but can be escalated.
    this.strictMode = Boolean(this.manifest.strict_mode);

    // REQUIRED: store exceptions for audit visibility (in addition to journal.ndjson).
    this.journal = [];

    this.outputDir = path.join('artifacts', `${this.manifest.matter_id || 'matter'}_${Date.now()}`);
    fs.ensureDirSync(this.outputDir);

    // LEGAL WHY: preserve interface labels and roles (WCAG 4.1.2 Name, Role, Value),
    // while redacting user-entered or user-specific data that creates privacy risk.
    this._axKeepKeys = new Set([
      'role',
      'name',
      'value',
      'children',
      'checked',
      'pressed',
      'expanded',
      'selected',
      'disabled',
      'required',
      'invalid',
      'focused',
      'level'
    ]);

    // Known liability fields, redact always.
    this._axAlwaysRedactKeys = new Set([
      'description',
      'help',
      'url',
      'placeholder',
      'ariaLabel',
      'aria-label',
      'ariaDescription',
      'aria-describedby',
      'keyshortcuts'
    ]);

    // Roles that commonly represent user-entered text, redact value for these.
    // NOTE: AX snapshots do not reliably expose HTML input type, role is the safest available proxy.
    this._axRedactValueRoles = new Set([
      'textbox',
      'searchbox',
      'combobox',
      'spinbutton'
    ]);

    // Roles where "value" is often structural state rather than user PII.
    this._axPreserveValueRoles = new Set([
      'button',
      'checkbox',
      'radio',
      'switch',
      'slider',
      'progressbar',
      'scrollbar'
    ]);
  }

  async initialize() {
    this.browser = await chromium.launch({ headless: true });
        // CONTEXT OVERRIDES: allow manifest to supply Playwright context options
    // Used for mobile emulation signals (isMobile, hasTouch, userAgent, deviceScaleFactor, viewport).
    const ctxOverrides = (this.manifest && this.manifest.playwright_context && typeof this.manifest.playwright_context === "object")
      ? this.manifest.playwright_context
      : {};
    this.context = await this.browser.newContext({
      ...ctxOverrides,
      userAgent: "AccessForensics/SKU-A-Forensic-Observer/5.7.3",
      viewport: this.manifest.viewport,
      ignoreHTTPSErrors: true
    });
    this.page = await this.context.newPage();
      // S10.C clean state
      await this.context.clearCookies();
      await this.context.clearPermissions();
      await this.page.goto('about:blank', { waitUntil: 'networkidle' });

    await this.page.addInitScript(() => {
      window.__af_mutations = 0;
      const observer = new MutationObserver(() => window.__af_mutations++);
      observer.observe(document, { attributes: true, childList: true, subtree: true });
    });
  }

  async captureMirror() {
    await this.waitForSettled();
    let content = await this.page.content();

    // PRESERVE: base href is needed to replay relative resources in a verification mirror.
    // LEGAL WHY: preserves the "what was observed" state in a reviewable artifact.
    const baseUrl = this.manifest.url;
    if (typeof baseUrl === 'string' && baseUrl.length > 0) {
      content = content.replace(/<head(\s[^>]*)?>/i, `<head$1><base href="${baseUrl}">`);
    }

    fs.writeFileSync(path.join(this.outputDir, 'verification_mirror.html'), content);
    return content;
  }

  async captureStep(selector) {
    // REQUIRED: enforce allowlist boundary.
    if (!this._isSelectorAllowed(selector)) {
      const exceptionTelemetry = {
        type: "EXCEPTION: OUT_OF_SCOPE",
        timestamp: new Date().toISOString(),
        selector: String(selector),
        reason: "Selector not present in manifest allowlist"
      };

      // REQUIRED: push to in-memory journal for immediate inspection.
      this.journal.push(exceptionTelemetry);

      // PRESERVE: exceptions must also be written to journal.ndjson and chained into hash.
      const entry = this._appendJournalEntry(exceptionTelemetry);

      if (this.strictMode) {
        const err = new Error(`OUT_OF_SCOPE selector rejected in strict mode: ${String(selector)}`);
        err.code = 'OUT_OF_SCOPE_SELECTOR';
        throw err;
      }

      return entry;
    }

    const node = await this.page.$(selector);
    if (!node) return null;

    const axSnapshot = await this.page.accessibility.snapshot({ root: node });
    this._sanitizeAxSnapshot(axSnapshot);

    const telemetry = {
      type: "CAPTURE_STEP",
      timestamp: new Date().toISOString(),
      selector: String(selector),
      ax_tree: axSnapshot
    };

    return this._appendJournalEntry(telemetry);
  }

  async waitForSettled(timeout = 10000) {
    const start = Date.now();
    let lastCount = await this.page.evaluate(() => window.__af_mutations);

    while (Date.now() - start < timeout) {
      await new Promise(r => setTimeout(r, 750));
      const currentCount = await this.page.evaluate(() => window.__af_mutations);
      if (currentCount === lastCount) return true;
      lastCount = currentCount;
    }

    return false;
  }

  _appendJournalEntry(telemetry) {
    // PRESERVE: stable top-level telemetry key ordering for deterministic hashing.
    const canonical = JSON.stringify(telemetry, Object.keys(telemetry).sort());
    const hash = crypto.createHash('sha256').update(this.prevHash + canonical).digest('hex');

    const entry = {
      prev_hash: this.prevHash,
      data: telemetry,
      hash
    };

    this.prevHash = hash;
    fs.appendFileSync(path.join(this.outputDir, 'journal.ndjson'), JSON.stringify(entry) + '\n');
    return entry;
  }

  _isSelectorAllowed(selector) {
    if (typeof selector !== 'string' || selector.trim().length === 0) return false;

    // ESCAPE HATCH: Explicitly configured unbounded mode.
    if (this.allowAllSelectors) return true;

    // DEFAULT: If no allowlist is provided and allowAll is false, DENY EVERYTHING.
    // LEGAL WHY: An empty scope implies "nothing is in scope", not "everything is in scope".
    if (this.allowedSelectors.size === 0) return false;

    return this.allowedSelectors.has(selector);
  }

  _buildAllowedSelectorSet(allowedSelectorsRaw) {
    const set = new Set();
    if (!Array.isArray(allowedSelectorsRaw)) return set;

    for (const item of allowedSelectorsRaw) {
      if (typeof item === 'string') {
        set.add(item);
        continue;
      }
      if (!item || typeof item !== 'object') continue;

      // Accept common manifest shapes.
      if (typeof item.id === 'string') set.add(item.id);
      if (typeof item.selector === 'string') set.add(item.selector);
      if (typeof item.css === 'string') set.add(item.css);
      if (typeof item.query === 'string') set.add(item.query);
    }

    return set;
  }

  _sanitizeAxSnapshot(node) {
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      for (const child of node) this._sanitizeAxSnapshot(child);
      return;
    }

    const role = typeof node.role === 'string' ? node.role : '';

    for (const key of Object.keys(node)) {
      if (key === 'children') {
        this._sanitizeAxSnapshot(node.children);
        continue;
      }

      if (this._axAlwaysRedactKeys.has(key)) {
        node[key] = "[REDACTED]";
        continue;
      }

      if (!this._axKeepKeys.has(key)) {
        if (typeof node[key] === 'string') node[key] = "[REDACTED]";
        else delete node[key];
        continue;
      }

      if (key === 'value') {
        // PRESERVE: structural values support WCAG Name, Role, Value validation.
        // REDACT: user-entered values are irrelevant to interface compliance and create privacy risk.
        if (this._axRedactValueRoles.has(role)) {
          node.value = "[REDACTED]";
        } else if (this._axPreserveValueRoles.has(role)) {
          // keep value
        } else {
          if (typeof node.value === 'string') node.value = "[REDACTED]";
        }
      }

      // name and role are preserved as primary interface evidence.
      // LEGAL WHY: name proves labels exist, role proves correct semantics.
    }
  }
}

module.exports = SKUAEngine;




