const fs = require("fs");
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

        const relativePath = path.relative(this.baseDir, filepath).replace(/\\/g, '/');
        const fileInfo = this._hashFile(filepath);

        this.records.push({
            relative_filepath: relativePath,
            sha256: fileInfo.sha256,
            bytes: fileInfo.bytes,
            expected_destination_path: relativePath
        });

        return filepath;
    }

    stageForReview() {
        const snapshotObj = {
            matter_id: this.matterId,
            records: this.records
        };
        const snapshotPath = path.join(this.baseDir, "state_snapshot.json");
        fs.writeFileSync(snapshotPath, JSON.stringify(snapshotObj, null, 2), "utf8");

        const viewerPath = path.join(this.baseDir, "REVIEW_viewer.html");
        let html = "<!DOCTYPE html>\n<html>\n<head>\n<title>REVIEW ONLY - Matter " + this.matterId + "</title>\n";
        html += "<style>body{font-family:sans-serif;padding:20px}.warning{background:#ffebee;border-left:4px solid #c00;padding:15px}.record{background:#f4f4f4;padding:10px;margin-bottom:10px}</style>\n</head>\n<body>\n";
        html += "<div class=\"warning\"><h2>REVIEW ONLY / NOT FINAL / NON-CANONICAL</h2>\n";
        html += "<p>This is a pre-delivery review artifact. It is NOT sealed. Do not send this to attorney delivery.</p></div>\n";
        html += "<h2>Review Artifacts</h2>\n";
        for (const record of this.records) {
            html += "<div class=\"record\"><a href=\"./" + record.relative_filepath + "\" target=\"_blank\">" + record.relative_filepath + "</a><br>Hash: <code>" + record.sha256 + "</code></div>\n";
        }
        html += "</body></html>";
        fs.writeFileSync(viewerPath, html, "utf8");

        return { snapshotPath, viewerPath };
    }

    static _walkSync(dir, filelist = [], rootDir = dir) {
        const files = fs.readdirSync(dir);
        if (files.length === 0 && dir !== rootDir) {
            filelist.push(path.relative(rootDir, dir).replace(/\\/g, '/') + '/');
            return filelist;
        }
        for (const file of files) {
            const filepath = path.join(dir, file);
            const stat = fs.statSync(filepath);
            if (stat.isDirectory()) {
                filelist = PacketAssembler._walkSync(filepath, filelist, rootDir);
            } else {
                filelist.push(path.relative(rootDir, filepath).replace(/\\/g, '/'));
            }
        }
        return filelist;
    }

    static _deriveInterimTemplateAuthority() {
        const templatePath = path.resolve(__dirname, "../../../..");
        try {
            const pkgBuffer = fs.readFileSync(path.join(templatePath, "package.json"));
            const pkg = JSON.parse(pkgBuffer.toString("utf8"));
            return {
                templateVersion: pkg.version,
                templateHash: crypto.createHash("sha256").update(pkgBuffer).digest("hex")
            };
        } catch (e) {
            throw new Error("Could not resolve strict runtime template authority. Failing closed.");
        }
    }

    static sealFromReview(reviewStageDir, targetDeliveryDir, operatorId, validityStatus = "valid_transmittable") {
        const { templateVersion, templateHash } = PacketAssembler._deriveInterimTemplateAuthority();

        const snapshotPath = path.join(reviewStageDir, "state_snapshot.json");
        if (!fs.existsSync(snapshotPath)) throw new Error("Missing state_snapshot.json. Cannot seal a packet that was not staged for review.");

        const stagedState = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
        const stagedRecords = stagedState.records;

        const liveFiles = PacketAssembler._walkSync(reviewStageDir);
        const cleanLiveFiles = liveFiles.filter(f => {
            if (f === "state_snapshot.json" || f === "REVIEW_viewer.html") return false;
            if (["01_Report/", "02_Exhibits/", "03_Verification/", "02_Exhibits/desktop_baseline/", "02_Exhibits/mobile_baseline/", "02_Exhibits/authorized_reflow/"].includes(f)) return false;
            return true;
        });

        const snapshotPaths = new Set(stagedRecords.map(r => r.relative_filepath));
        for (const liveFile of cleanLiveFiles) {
            if (!snapshotPaths.has(liveFile)) {
                throw new Error(`Tamper detected: Alien file or directory introduced after review: ${liveFile}`);
            }
        }

        const cleanLiveSet = new Set(cleanLiveFiles);
        for (const record of stagedRecords) {
            if (!cleanLiveSet.has(record.relative_filepath)) {
                throw new Error(`Tamper detected: Missing file ${record.relative_filepath}`);
            }
            const filepath = path.join(reviewStageDir, record.relative_filepath);
            const fileBuffer = fs.readFileSync(filepath);
            const hashSum = crypto.createHash("sha256");
            hashSum.update(fileBuffer);
            if (hashSum.digest("hex") !== record.sha256) {
                throw new Error(`Tamper detected: File ${record.relative_filepath} was modified after review staging.`);
            }
        }

        const deliveryAssembler = new PacketAssembler(targetDeliveryDir, stagedState.matter_id || "unknown", operatorId);
        deliveryAssembler.init();

        for (const record of stagedRecords) {
            const srcPath = path.join(reviewStageDir, record.relative_filepath);
            const destPath = path.join(targetDeliveryDir, record.expected_destination_path);
            const destDir = path.dirname(destPath);
            if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
            fs.copyFileSync(srcPath, destPath);

            deliveryAssembler.records.push({
                filepath: record.expected_destination_path,
                sha256: record.sha256,
                bytes: record.bytes
            });
        }

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

    seal(validityStatus = "valid_transmittable") {
        const { templateVersion: controlledTemplateVersion, templateHash: controlledTemplateHash } = PacketAssembler._deriveInterimTemplateAuthority();

        const formattedRecords = this.records.map(r => ({
            filepath: r.relative_filepath,
            sha256: r.sha256,
            bytes: r.bytes
        }));

        const manifestObj = {
            matter_id: this.matterId,
            packet_version: this.version,
            packet_generated_local: new Date().toISOString(),
            packet_generated_epoch_ms: Date.now(),
            operator_id: this.operatorId,
            controlled_template_version: controlledTemplateVersion,
            controlled_template_hash: controlledTemplateHash,
            packet_validity_status: validityStatus,
            records: formattedRecords
        };

        const result = validateManifestRoot(manifestObj);
        if (!result.valid) {
            throw new Error("Manifest failed schema validation: " + JSON.stringify(result.errors));
        }

        const targetDir = this.dirs.verification;
        const filepath = path.join(targetDir, "manifest.json");
        fs.writeFileSync(filepath, JSON.stringify(manifestObj, null, 2), "utf8");
        this.records.push({
             relative_filepath: "03_Verification/manifest.json",
             expected_destination_path: "03_Verification/manifest.json",
             sha256: this._hashFile(filepath).sha256,
             bytes: this._hashFile(filepath).bytes
        });
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
