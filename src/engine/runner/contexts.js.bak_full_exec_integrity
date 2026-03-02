'use strict';

// Runner contexts must not define viewport/DPR baselines.
// They must consume the canonical intake context builder.
const contextFactory = require('../intake/contextfactory.js');

function getDesktopContext() {
  return contextFactory.getDesktopContextOptions();
}

function getMobileContext(deviceProfile) {
  // contextFactory already hard-locks viewport + deviceScaleFactor after profile merge
  return contextFactory.getMobileContextOptions(deviceProfile);
}

module.exports = {
  getDesktopContext,
  getMobileContext
};