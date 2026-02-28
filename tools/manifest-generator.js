'use strict';

const fs = require('fs');
const path = require('path');
const ENUMS = require('../engine/intake/enums.js');

function getViewport(kind) {
  if (ENUMS.VIEWPORT && ENUMS.VIEWPORT[kind]) return ENUMS.VIEWPORT[kind];
  if (ENUMS.CONTEXTS && ENUMS.CONTEXTS[kind] && ENUMS.CONTEXTS[kind].viewport) return ENUMS.CONTEXTS[kind].viewport;
  throw new Error('CANONICAL_ENUMS_MISSING_VIEWPORT: kind=' + String(kind));
}

function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function main() {
  const manifestsDir = path.join(process.cwd(), 'manifests');
  if (!fs.existsSync(manifestsDir)) throw new Error('Missing manifests directory: ' + manifestsDir);

  const dv = getViewport('DESKTOP');
  const mv = getViewport('MOBILE');

  const smokeDesktopPath = path.join(manifestsDir, 'smoke_desktop.json');
  const smokeMobilePath  = path.join(manifestsDir, 'smoke_mobile.json');

  
  const smokePath       = path.join(manifestsDir, 'smoke.json');
const smokeDesktop = {
    matter_id: 'smoke',
    strict_mode: true,
    url: 'https://example.com',
    viewport: { width: dv.width, height: dv.height },
    allowed_selectors: []
  };

  const smokeMobile = {
    matter_id: 'smoke',
    strict_mode: true,
    url: 'https://example.com',
    viewport: { width: mv.width, height: mv.height },
    allowed_selectors: []
  };

  writeJson(smokeDesktopPath, smokeDesktop);
  writeJson(smokeMobilePath, smokeMobile);

    writeJson(smokePath, smokeDesktop);
console.log('[OK] wrote smoke manifests from canonical enums');
}

if (require.main === module) main();