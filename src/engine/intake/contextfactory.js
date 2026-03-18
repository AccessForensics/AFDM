"use strict";

const { VIEWPORT } = require("./enums.js");

const DESKTOP_CONTEXT_OPTIONS = Object.freeze({
  viewport: Object.freeze({ width: VIEWPORT.DESKTOP.width, height: VIEWPORT.DESKTOP.height }),
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false,
  locale: "en-US",
  timezoneId: "America/New_York",
});

const MOBILE_CONTEXT_OPTIONS = Object.freeze({
  viewport: Object.freeze({ width: VIEWPORT.MOBILE.width, height: VIEWPORT.MOBILE.height }),
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  locale: "en-US",
  timezoneId: "America/New_York",
});

function cloneContextOptions(template) {
  return {
    ...template,
    viewport: { ...template.viewport },
  };
}

module.exports = {
  getDesktopContextOptions() {
    return cloneContextOptions(DESKTOP_CONTEXT_OPTIONS);
  },
  getMobileContextOptions() {
    return cloneContextOptions(MOBILE_CONTEXT_OPTIONS);
  },
};