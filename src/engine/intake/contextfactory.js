"use strict";

// Viewport values are sourced exclusively from canonical enums via locked.js.
// deviceScaleFactor: 1 is set LAST, after any device profile merge, as a hard lock.
const { getViewport } = require("./locked.js");

const contextFactory = {
  getDesktopContextOptions() {
    return {
      viewport:          getViewport("DESKTOP"),
      isMobile:          false,
      hasTouch:          false,
      locale:            "en-US",
      timezoneId:        "America/New_York",
      deviceScaleFactor: 1
    };
  },

  getMobileContextOptions(deviceProfile) {
    const base = deviceProfile ? { ...deviceProfile } : {};
    return {
      ...base,
      viewport:          getViewport("MOBILE"),
      isMobile:          true,
      hasTouch:          true,
      locale:            "en-US",
      timezoneId:        "America/New_York",
      deviceScaleFactor: 1
    };
  }
};

module.exports = contextFactory;