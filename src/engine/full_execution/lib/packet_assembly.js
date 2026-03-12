const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { validateManifestRoot } = require("../validators/schema_validator");

/**
 * Ensures strict full-execution packet folder structure:
 * 01_Report
 * 02_Exhibits
 * 03_Verification
 */

class PacketAssembler {
    constructor(baseDir, matterId, operatorId, version = "v1") {
        this.baseDir = path.resolve(baseDir);
        this.matterId = matterId;
        this.operatorId = operatorId;
        this.version = version;

        // Exact top-level structure required by Section 15.2
        this.dirs = {
            report: path.join(this.baseDir, "01_Report"),
            exhibits: path.join(this.baseDir, "02_Exhibits"),
            verification: path.join(this.baseDir, "03_Verification")
        };

        // Inside Exhibits
        this.subdirs = {
            desktop_baseline: path.join(this.dirs.exhibits, "desktop_baseline"),
            mobile_baseline: path.join(this.dirs.exhibits, "mobile_baseline"),
            authorized_reflow: path.join(this.dirs.exhibits, "authorized_reflow")
        };

        this.records = [];
    }

    init() {
        // Build base
        for (const p of Object.values(this.dirs)) {
            fs.mkdirSync(p, { recursive: true });
        }
        // Build exhibits subdirs
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
        let targetDir = this.dirs.report; // default
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

        const relativePath = path.relative(this.baseDir, filepath).replace(/\\/g, '/');
        const fileInfo = this._hashFile(filepath);

        this.records.push({
            filepath: relativePath,
            sha256: fileInfo.sha256,
            bytes: fileInfo.bytes
        });

        return filepath;
    }

    seal(validityStatus = "valid_transmittable", controlledTemplateVersion, controlledTemplateHash) {
        if (!controlledTemplateVersion || !controlledTemplateHash) {
            throw new Error("Controlled template version and hash are required for fail-closed sealing.");
        }

        // Write the manifest to 03_Verification
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
        if (!result.valid) {
            throw new Error("Manifest failed schema validation: " + JSON.stringify(result.errors));
        }

        const manifestPath = this.writeRecord("03_Verification", "manifest.json", manifestObj, "json");
        return manifestPath;
    }

    generateVerificationOutputs() {
        const manifestPath = path.join(this.dirs.verification, "manifest.json");
        if (!fs.existsSync(manifestPath)) throw new Error("Manifest not sealed yet.");

        const manifestContent = fs.readFileSync(manifestPath);
        const hashSum = crypto.createHash("sha256");
        hashSum.update(manifestContent);
        const sha256 = hashSum.digest("hex");

        const sealPath = path.join(this.dirs.verification, "packet_seal.txt");
        fs.writeFileSync(sealPath, sha256, "utf8");

        // NOTE: packet_seal.txt proves the manifest hash, but it cannot be inside the manifest
        // because its own generation depends on the finalized manifest bytes.
        // This is a cryptographic reality, not a defect.

        return {
            sealHash: sha256,
            manifestPath
        };
    }
}
module.exports = PacketAssembler;
