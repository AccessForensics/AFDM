'use strict';

const MOBILE_KEYWORDS = [
  'mobile', 'phone', 'tablet', 'handheld', 'iphone',
  'samsung galaxy', 'android', 'touch', 'tap', 'swipe',
  'pinch', 'long-press', 'mobile safari', 'android chrome',
  'viewport', 'screen size', 'width'
];

class AnchorDetector {

  static get MOBILE_KEYWORDS() {
    return MOBILE_KEYWORDS;
  }

  static detect(text) {
    const str   = String(text || '');
    const lower = str.toLowerCase();

    for (const keyword of MOBILE_KEYWORDS) {
      if (lower.includes(keyword)) {
        const lines       = str.split('\n');
        const matchingLine = lines.find(l => l.toLowerCase().includes(keyword));
        return {
          mobileInScope: true,
          anchorPhrase:  (matchingLine ? matchingLine.trim() : keyword) +
                         ' [anchor-keyword: "' + keyword + '"]'
        };
      }
    }

    const dimensionMatch = str.match(/\b[3-9]\d{2,3}px\b/i);
    if (dimensionMatch) {
      return {
        mobileInScope: true,
        anchorPhrase:  dimensionMatch[0] + ' [anchor-dimension]'
      };
    }

    return { mobileInScope: false, anchorPhrase: null };
  }
}

function detectAnchor(text) {
  return AnchorDetector.detect(text);
}

module.exports = { AnchorDetector, detectAnchor, MOBILE_KEYWORDS };
