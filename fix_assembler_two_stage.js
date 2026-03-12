const fs = require('fs');

const content = `const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { validateManifestRoot } = require("../validators/schema_validator");

class PacketAssembler {
    constructor(baseDir, matterId, operatorId, version = "v1") {
        this.baseDir = path.resolve(baseDir);
        this.matterId = matterId;
        this.operatorId = operatorId;
        this.version = version;

        this.dirs = {
            report: path.join(this.baseDir, "01_Report"),
            exhibits: path.join(this.baseDir, "02_Exhibits"),
            verification: path.join(this.baseDir, "03_Verification")
        };

        this.subdirs = {
            desktop_baseline: path.join(this.dirs.exhibits, "desktop_baseline"),
            mobile_baseline: path.join(this.dirs.exhibits, "mobile_baseline"),
            authorized_reflow: path.join(this.dirs.exhibits, "authorized_reflow")
        };

        this.records = [];
    }

    init() {
        for (const p of Object.values(this.dirs)) {
            fs.mkdirSync(p, { recursive: true });
        }
        for (const p of Object.values(this.subdirs)) {
            fs.mkdirSync(p, { recursive: true });
        }
    }

    _hashFile(filepath) {
        const fileBuffer = fs.readFileSync(filepath);
        const hashSum = crypto.createHash("sha256");
        hashSum.update(fileBuffer);
        return {
            sha256: hashSum.digest("hex"),
            bytes: fileBuffer.length
        };
    }

    writeRecord(relativeCategory, filename, content, format = "json") {
        let targetDir = this.dirs.report;
        if (relativeCategory.startsWith("01_Report")) targetDir = this.dirs.report;
        else if (relativeCategory.startsWith("02_Exhibits")) targetDir = path.join(this.baseDir, relativeCategory);
        else if (relativeCategory.startsWith("03_Verification")) targetDir = this.dirs.verification;
        else throw new Error("Invalid top-level folder prefix.");

        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const filepath = path.join(targetDir, filename);
        if (format === "json") {
            fs.writeFileSync(filepath, JSON.stringify(content, null, 2), "utf8");
        } else {
            fs.writeFileSync(filepath, content);
        }

        const relativePath = path.relative(this.baseDir, filepath).replace(/\\\\/g, '/');
        const fileInfo = this._hashFile(filepath);

        this.records.push({
            filepath: relativePath,
            sha256: fileInfo.sha256,
            bytes: fileInfo.bytes
        });

        return filepath;
    }

    /**
     * Stage 1: Pre-delivery review artifact.
     * Generates a viewable HTML index and a state_snapshot but explicitly DOES NOT seal the packet.
     */
    stageForReview() {
        // Create an internal snapshot to guarantee the review stage matches the final seal stage
        const snapshotPath = path.join(this.baseDir, "state_snapshot.json");
        fs.writeFileSync(snapshotPath, JSON.stringify(this.records, null, 2), "utf8");

        // Generate the review viewer
        const viewerPath = path.join(this.baseDir, "REVIEW_viewer.html");
        let html = "<!DOCTYPE html>\\n<html>\\n<head>\\n<title>REVIEW ONLY - Matter " + this.matterId + "</title>\\n";
        html += "<style>body{font-family:sans-serif;padding:20px}.warning{background:#ffebee;border-left:4px solid #c00;padding:15px}.record{background:#f4f4f4;padding:10px;margin-bottom:10px}</style>\\n</head>\\n<body>\\n";
        html += "<div class=\\"warning\\"><h2>REVIEW ONLY / NOT FINAL / NON-CANONICAL</h2>\\n";
        html += "<p>This is a pre-delivery review artifact. It is NOT sealed. Do not send this to attorney delivery.</p></div>\\n";
        html += "<h2>Review Artifacts</h2>\\n";
        for (const record of this.records) {
            html += "<div class=\\"record\\"><a href=\\"./" + record.filepath + "\\" target=\\"_blank\\">" + record.filepath + "</a><br>Hash: <code>" + record.sha256 + "</code></div>\\n";
        }
        html += "</body></html>";
        fs.writeFileSync(viewerPath, html, "utf8");

        return { snapshotPath, viewerPath };
    }

    /**
     * Stage 2: Final seal.
     * Ingests a previously staged review snapshot, verifies nothing was tampered with, and applies the final canonical manifest and hash seal.
     */
    static sealFromReview(reviewStageDir, targetDeliveryDir, operatorId, templateVersion, templateHash, validityStatus = "valid_transmittable") {
        if (!templateVersion || !templateHash) {
            throw new Error("Controlled template version and hash are required for fail-closed sealing.");
        }

        const snapshotPath = path.join(reviewStageDir, "state_snapshot.json");
        if (!fs.existsSync(snapshotPath)) throw new Error("Missing state_snapshot.json. Cannot seal a packet that was not staged for review.");

        const stagedRecords = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));

        // Anti-tamper lock: Verify every file in the snapshot hasn't changed since review
        for (const record of stagedRecords) {
            const filepath = path.join(reviewStageDir, record.filepath);
            if (!fs.existsSync(filepath)) throw new Error(\`Tamper detected: Missing file \${record.filepath}\`);
            const fileBuffer = fs.readFileSync(filepath);
            const hashSum = crypto.createHash("sha256");
            hashSum.update(fileBuffer);
            if (hashSum.digest("hex") !== record.sha256) {
                throw new Error(\`Tamper detected: File \${record.filepath} was modified after review staging.\`);
            }
        }

        // Copy clean files to delivery packet (stripping out the non-canonical review markers)
        const deliveryAssembler = new PacketAssembler(targetDeliveryDir, stagedRecords.matter_id || "unknown", operatorId);
        deliveryAssembler.init();

        for (const record of stagedRecords) {
            const srcPath = path.join(reviewStageDir, record.filepath);
            const destPath = path.join(targetDeliveryDir, record.filepath);
            const destDir = path.dirname(destPath);
            if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
            fs.copyFileSync(srcPath, destPath);
            deliveryAssembler.records.push({ ...record });
        }

        // Now seal the delivery packet
        const manifestObj = {
            matter_id: deliveryAssembler.matterId,
            packet_version: deliveryAssembler.version,
            packet_generated_local: new Date().toISOString(),
            packet_generated_epoch_ms: Date.now(),
            operator_id: deliveryAssembler.operatorId,
            controlled_template_version: templateVersion,
            controlled_template_hash: templateHash,
            packet_validity_status: validityStatus,
            records: deliveryAssembler.records
        };

        const result = validateManifestRoot(manifestObj);
        if (!result.valid) throw new Error("Manifest failed schema validation: " + JSON.stringify(result.errors));

        const manifestPath = path.join(deliveryAssembler.dirs.verification, "manifest.json");
        fs.writeFileSync(manifestPath, JSON.stringify(manifestObj, null, 2), "utf8");

        const manifestContent = fs.readFileSync(manifestPath);
        const manifestHash = crypto.createHash("sha256").update(manifestContent).digest("hex");
        fs.writeFileSync(path.join(deliveryAssembler.dirs.verification, "packet_seal.txt"), manifestHash, "utf8");

        return {
            sealHash: manifestHash,
            manifestPath,
            deliveryDir: targetDeliveryDir
        };
    }

    // Kept for backward compat with test flows that just need a quick seal during mock generation without staging
    seal(validityStatus = "valid_transmittable", controlledTemplateVersion, controlledTemplateHash) {
        if (!controlledTemplateVersion || !controlledTemplateHash) throw new Error("Controlled template version and hash are required for fail-closed sealing.");
        const manifestObj = {
            matter_id: this.matterId,
            packet_version: this.version,
            packet_generated_local: new Date().toISOString(),
            packet_generated_epoch_ms: Date.now(),
            operator_id: this.operatorId,
            controlled_template_version: controlledTemplateVersion,
            controlled_template_hash: controlledTemplateHash,
            packet_validity_status: validityStatus,
            records: this.records
        };
        const result = validateManifestRoot(manifestObj);
        if (!result.valid) throw new Error("Manifest failed schema validation: " + JSON.stringify(result.errors));
        this.writeRecord("03_Verification", "manifest.json", manifestObj, "json");
    }

    generateVerificationOutputs() {
        const manifestPath = path.join(this.dirs.verification, "manifest.json");
        if (!fs.existsSync(manifestPath)) throw new Error("Manifest not sealed yet.");
        const manifestContent = fs.readFileSync(manifestPath);
        const hashSum = crypto.createHash("sha256");
        hashSum.update(manifestContent);
        const sha256 = hashSum.digest("hex");
        fs.writeFileSync(path.join(this.dirs.verification, "packet_seal.txt"), sha256, "utf8");
        return { sealHash: sha256, manifestPath };
    }
}
module.exports = PacketAssembler;
`;
fs.writeFileSync("src/engine/full_execution/lib/packet_assembly.js", content);
