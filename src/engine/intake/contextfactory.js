'use strict';

const contextFactory = {

  getDesktopContextOptions() {
    return {
      viewport:          { width: 1366, height: 900 },
      userAgent:         'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      deviceScaleFactor: 1,
      isMobile:          false,
      hasTouch:          false,
      locale:            'en-US',
      timezoneId:        'America/New_York'
    };
  },

  getMobileContextOptions() {
    return {
      viewport:          { width: 390, height: 844 },
      userAgent:         'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      deviceScaleFactor: 3,
      isMobile:          true,
      hasTouch:          true,
      locale:            'en-US',
      timezoneId:        'America/New_York'
    };
  }

};

module.exports = contextFactory;

