const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Generates a non-canonical HTML viewer from a sealed packet's manifest.
 * The viewer artifact is explicitly saved OUTSIDE the canonical packet boundary.
 */
function generateViewer(packetDirPath, outputDir) {
    const manifestPath = path.join(packetDirPath, '03_Verification', 'manifest.json');
    const sealPath = path.join(packetDirPath, '03_Verification', 'packet_seal.txt');

    if (!fs.existsSync(manifestPath) || !fs.existsSync(sealPath)) {
        throw new Error("Cannot generate viewer: Target is not a valid sealed packet.");
    }

    // Verify manifest seal first
    const manifestContent = fs.readFileSync(manifestPath);
    const hashSum = crypto.createHash("sha256");
    hashSum.update(manifestContent);
    const calculatedHash = hashSum.digest("hex");
    const storedHash = fs.readFileSync(sealPath, 'utf8').trim();

    if (calculatedHash !== storedHash) {
        throw new Error("Cannot generate viewer: Packet seal verification failed. Canonical integrity is broken.");
    }

    const manifest = JSON.parse(manifestContent);
    const matterId = manifest.matter_id;
    const packetFolderName = path.basename(packetDirPath);

    // Generate Viewer HTML
    let html = "<!DOCTYPE html>\n<html>\n<head>\n";
    html += "<title>NON-CANONICAL VIEWER - Matter " + matterId + "</title>\n";
    html += "<style>\nbody { font-family: system-ui, sans-serif; padding: 20px; background: #f9f9f9; }\n.warning { background: #fee; border-left: 4px solid #c00; padding: 15px; margin-bottom: 20px; }\n.record { background: #fff; border: 1px solid #ddd; padding: 10px; margin-bottom: 10px; border-radius: 4px; }\ncode { background: #eee; padding: 2px 4px; border-radius: 3px; font-size: 0.9em; color: #d14; }\na { color: #0066cc; text-decoration: none; font-weight: bold; }\na:hover { text-decoration: underline; }\n</style>\n</head>\n<body>\n";
    html += "<div class=\"warning\">\n<h2 style=\"margin-top:0;color:#c00;\">WARNING: NON-CANONICAL ARTIFACT</h2>\n";
    html += "<p>This HTML viewer is a <strong>derivative access layer</strong> created for human inspection only.</p>\n";
    html += "<p>This file is explicitly <strong>OUTSIDE the canonical hash boundary</strong> of the sealed packet.</p>\n";
    html += "<p>Opening links below for read-only inspection is safe and will not alter hashes. However, modifying, saving, or re-serializing the linked target files in any editor will permanently break the canonical packet integrity.</p>\n";
    html += "<p><strong>Packet Validity Status:</strong> " + manifest.packet_validity_status + "</p>\n";
    html += "<p><strong>Verified Seal Hash:</strong> <code>" + storedHash + "</code></p>\n</div>\n";
    html += "<h2>Sealed Artifact Index</h2>\n";

    for (const record of manifest.records) {
        const relativeLink = "./" + packetFolderName + "/" + record.filepath;
        html += "<div class=\"record\">\n";
        html += "<p><strong>File:</strong> <a href=\"" + relativeLink + "\" target=\"_blank\" rel=\"noopener noreferrer\">" + record.filepath + "</a></p>\n";
        html += "<p><strong>SHA-256:</strong> <code>" + record.sha256 + "</code></p>\n";
        html += "<p><strong>Size:</strong> " + record.bytes + " bytes</p>\n</div>\n";
    }

    html += "</body>\n</html>";

    // The viewer MUST be saved outside the packet directory.
    const outputFilename = matterId + "_non_canonical_viewer.html";
    const outputPath = path.join(outputDir, outputFilename);

    fs.writeFileSync(outputPath, html, 'utf8');
    return outputPath;
}

module.exports = { generateViewer };
