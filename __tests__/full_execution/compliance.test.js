const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

describe("Full Execution (Sections 11-23) Compliance", () => {
    test("Layer 1/2/3: Validator rejects missing Shared Schemas (Initialization Fail-Closed)", () => {
        const { execSync } = require("child_process");
        let errorThrown = false;

        const targetPath = path.join(__dirname, "../../src/engine/schemas/capture_unit.schema.json");
        const backupPath = path.join(__dirname, "../../src/engine/schemas/capture_unit.schema.json.bak");
        fs.renameSync(targetPath, backupPath);

        try {
            execSync("node -e \"require('./src/engine/full_execution/validators/schema_validator')\"", { cwd: path.join(__dirname, "../../") });
        } catch (e) {
            errorThrown = true;
            expect(e.stderr.toString()).toMatch(/ENOENT/);
        }
        expect(errorThrown).toBe(true);

        fs.renameSync(backupPath, targetPath);
    });

    const PacketAssembler = require("../../src/engine/full_execution/lib/packet_assembly");
    const RuntimeEnvelope = require("../../src/engine/full_execution/lib/runtime_envelope");
    const { validateInteractionPlan, validateCaptureUnit, validateManifestRoot, validateTransmittalGate } = require("../../src/engine/full_execution/validators/schema_validator");

    const validFixture = require("../../fixtures/full_execution/deterministic_valid.json");
    const failFixture = require("../../fixtures/full_execution/deterministic_fail.json");

    test("Layer 1/2/3: Runtime Envelope enforces operator attestation (Section 22)", () => {
        const envelope = new RuntimeEnvelope(validFixture.matter_id, validFixture.operator_id);
        const opRec = envelope.assignOperator(validFixture.independence_attestation);
        expect(opRec.independence_attestation).toBe(true);
    });

    test("Layer 1/2/3: Runtime Envelope fail-closed on false attestation", () => {
        const envelope = new RuntimeEnvelope(failFixture.matter_id, failFixture.operator_id);
        expect(() => {
            envelope.assignOperator(failFixture.independence_attestation);
        }).toThrow("OperatorRecord invalid");
    });

    test("Layer 1/2/3: Runtime Envelope tracks ScopeDeltas additively (Section 11.6)", () => {
        const envelope = new RuntimeEnvelope(validFixture.matter_id, validFixture.operator_id);
        envelope.assignOperator(true);
        const delta = envelope.addScopeDelta(validFixture.scope_delta);
        expect(envelope.scopeDeltas.length).toBe(1);
    });

    test("Layer 1/2/3: PacketAssembler generates exact folder structure (Section 15.2)", () => {
        const tmpDir = path.join(__dirname, "../../tmp/full_exec_out", "test_packet");
        const assembler = new PacketAssembler(tmpDir, "M-101", "OP-999");
        assembler.init();
        expect(fs.existsSync(path.join(tmpDir, "01_Report"))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, "02_Exhibits", "desktop_baseline"))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, "00_Manifest"))).toBe(false);
    });

    test("Layer 1/2/3: PacketAssembler handles constraint dictionaries strictly", () => {
        const envelope = new RuntimeEnvelope("M-101", "OP-999");
        expect(() => envelope.handleConstraint("InvalidOutcome", "BOTMITIGATION")).toThrow("Invalid outcome label");
        const valid = envelope.handleConstraint("Constrained", "BOTMITIGATION");
        expect(valid.outcome_label).toBe("Constrained");
    });

    test("Layer 1/2/3: Validator rejects invalid Shared Schema (InteractionPlan)", () => {
        const result = validateInteractionPlan({ allegation_id: "a-1" });
        expect(result.valid).toBe(false);
    });

    test("Layer 1/2/3: Validator rejects invalid Shared Schema (CaptureUnit)", () => {
        const result = validateCaptureUnit({ outcome_label: "Not a real label" });
        expect(result.valid).toBe(false);
    });

    test("Layer 1/2/3: Validator rejects invalid ManifestRoot structure", () => {
        const result = validateManifestRoot({ matter_id: "M-101", packet_version: "v1" });
        expect(result.valid).toBe(false);
    });

    test("Layer 1/2/3: Transmittal Gate strictly enforces verification checks", () => {
        const validGate = {
            matter_id: "M-101",
            packet_version: "v1",
            schema_validation_passed: true,
            hash_chain_verified: true,
            manifest_binding_verified: true,
            external_output_review_passed: true,
            operator_id: "OP-999",
            gate_timestamp_local: new Date().toISOString(),
            gate_timestamp_epoch_ms: Date.now(),
            packet_validity_status: "valid_transmittable"
        };
        expect(validateTransmittalGate(validGate).valid).toBe(true);
        expect(validateTransmittalGate({ ...validGate, hash_chain_verified: false }).valid).toBe(false);
    });

    test("Layer 1/2/3: PacketAssembler derives interim template authority strictly from root package.json", () => {
        const tmpDir = path.join(__dirname, "../../tmp/full_exec_out", "test_packet_templates");
        const assembler = new PacketAssembler(tmpDir, "M-101", "OP-999");
        assembler.init();
        expect(() => {
            assembler.seal("valid_transmittable");
        }).not.toThrow();

        const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, "03_Verification", "manifest.json"), "utf8"));
        expect(manifest.controlled_template_hash).not.toBe("0000000000000000000000000000000000000000000000000000000000000000");
        expect(manifest.controlled_template_hash).toMatch(/^[a-f0-9]{64}$/);
    });

    test("Layer 1/2/3: PacketAssembler rejects invalid schema records during seal", () => {
        const tmpDir = path.join(__dirname, "../../tmp/full_exec_out", "test_schema_seal");
        const assembler = new PacketAssembler(tmpDir, "M-101", "OP-999");
        assembler.init();
        expect(() => {
            assembler.seal("junk_status");
        }).toThrow("Manifest failed schema validation");
    });

    test("Layer 1/2/3: PacketAssembler workflow dictates staging review before sealing", () => {
        const tmpDir = path.join(__dirname, "../../tmp/full_exec_out");
        const stageDir = path.join(tmpDir, "M-STAGE-1_review_stage");
        const finalDir = path.join(tmpDir, "M-STAGE-1_delivery_packet");

        const assembler = new PacketAssembler(stageDir, "M-STAGE-1", "OP-999");
        assembler.init();
        assembler.writeRecord("01_Report", "data.txt", "Some captured data", "txt");
        assembler.stageForReview();

        expect(fs.existsSync(path.join(stageDir, "REVIEW_viewer.html"))).toBe(true);
        expect(fs.existsSync(path.join(stageDir, "03_Verification", "packet_seal.txt"))).toBe(false);

        const sealResult = PacketAssembler.sealFromReview(stageDir, finalDir, "OP-999");

        expect(fs.existsSync(path.join(finalDir, "REVIEW_viewer.html"))).toBe(false);
        expect(fs.existsSync(path.join(finalDir, "state_snapshot.json"))).toBe(false);

        const snapshotContent = JSON.parse(fs.readFileSync(path.join(stageDir, "state_snapshot.json"), "utf8"));
        const finalManifestContent = JSON.parse(fs.readFileSync(path.join(finalDir, "03_Verification", "manifest.json"), "utf8"));

        const reviewRecords = snapshotContent.records.map(r => ({ path: r.relative_filepath, sha256: r.sha256, bytes: r.bytes }));
        const finalRecords = finalManifestContent.records.filter(r => !r.filepath.includes("03_Verification")).map(r => ({ path: r.filepath, sha256: r.sha256, bytes: r.bytes }));

        expect(finalRecords).toEqual(reviewRecords);
    });

    test("Layer 1/2/3: PacketAssembler seal rejects deleted file after review", () => {
        const tmpDir = path.join(__dirname, "../../tmp/full_exec_out");
        const stageDir = path.join(tmpDir, "M-TAMPER-DEL_review_stage");
        const finalDir = path.join(tmpDir, "M-TAMPER-DEL_delivery_packet");

        const assembler = new PacketAssembler(stageDir, "M-TAMPER", "OP-999");
        assembler.init();
        assembler.writeRecord("01_Report", "data.txt", "Original data", "txt");
        assembler.stageForReview();

        fs.unlinkSync(path.join(stageDir, "01_Report", "data.txt"));

        expect(() => {
            PacketAssembler.sealFromReview(stageDir, finalDir, "OP");
        }).toThrow(/^Tamper detected: Missing file 01_Report\/data\.txt$/);
    });

    test("Layer 1/2/3: PacketAssembler seal rejects extra file added after review", () => {
        const tmpDir = path.join(__dirname, "../../tmp/full_exec_out");
        const stageDir = path.join(tmpDir, "M-TAMPER-EXT_review_stage");
        const finalDir = path.join(tmpDir, "M-TAMPER-EXT_delivery_packet");

        const assembler = new PacketAssembler(stageDir, "M-TAMPER", "OP-999");
        assembler.init();
        assembler.writeRecord("01_Report", "data.txt", "Original data", "txt");
        assembler.stageForReview();

        fs.writeFileSync(path.join(stageDir, "01_Report", "alien.txt"), "smuggled", "utf8");

        expect(() => {
            PacketAssembler.sealFromReview(stageDir, finalDir, "OP");
        }).toThrow(/^Tamper detected: Alien file or directory introduced after review: 01_Report\/alien\.txt$/);
    });

    test("Layer 1/2/3: PacketAssembler seal rejects extra directory added after review", () => {
        const tmpDir = path.join(__dirname, "../../tmp/full_exec_out");
        const stageDir = path.join(tmpDir, "M-TAMPER-DIR_review_stage");
        const finalDir = path.join(tmpDir, "M-TAMPER-DIR_delivery_packet");

        const assembler = new PacketAssembler(stageDir, "M-TAMPER", "OP-999");
        assembler.init();
        assembler.writeRecord("01_Report", "data.txt", "Original data", "txt");
        assembler.stageForReview();

        const alienDir = path.join(stageDir, "01_Report", "alien_folder");
        fs.mkdirSync(alienDir);
        fs.writeFileSync(path.join(alienDir, "alien.txt"), "smuggled", "utf8");

        expect(() => {
            PacketAssembler.sealFromReview(stageDir, finalDir, "OP");
        }).toThrow("Tamper detected: Alien file or directory introduced after review: 01_Report/alien_folder/");
    });

    test("Layer 1/2/3: PacketAssembler seal rejects empty directory added after review", () => {
        const tmpDir = path.join(__dirname, "../../tmp/full_exec_out");
        const stageDir = path.join(tmpDir, "M-TAMPER-EMP_review_stage");
        const finalDir = path.join(tmpDir, "M-TAMPER-EMP_delivery_packet");

        const assembler = new PacketAssembler(stageDir, "M-TAMPER", "OP-999");
        assembler.init();
        assembler.writeRecord("01_Report", "data.txt", "Original data", "txt");
        assembler.stageForReview();

        const alienDir = path.join(stageDir, "01_Report", "empty_folder");
        fs.mkdirSync(alienDir);

        expect(() => {
            PacketAssembler.sealFromReview(stageDir, finalDir, "OP");
        }).toThrow(/^Tamper detected: Alien file or directory introduced after review: 01_Report\/empty_folder\/$/);
    });

    test("Layer 1/2/3: PacketAssembler seal rejects renamed file after review", () => {
        const tmpDir = path.join(__dirname, "../../tmp/full_exec_out");
        const stageDir = path.join(tmpDir, "M-TAMPER-REN_review_stage");
        const finalDir = path.join(tmpDir, "M-TAMPER-REN_delivery_packet");

        const assembler = new PacketAssembler(stageDir, "M-TAMPER", "OP-999");
        assembler.init();
        assembler.writeRecord("01_Report", "data.txt", "Original data", "txt");
        assembler.stageForReview();

        fs.renameSync(path.join(stageDir, "01_Report", "data.txt"), path.join(stageDir, "01_Report", "renamed.txt"));

        expect(() => {
            PacketAssembler.sealFromReview(stageDir, finalDir, "OP");
        }).toThrow(/^Tamper detected: Alien file or directory introduced after review: 01_Report\/renamed\.txt$/);
    });

    test("Layer 1/2/3: Real Execution Engine produces real artifact buffers", async () => {
        const FullExecutionEngine = require("../../src/engine/full_execution/lib/execution_engine");

        // Execute against about:blank locally to ensure test isolation and no flaky external network deps
        const output = await FullExecutionEngine.run("M-101", "about:blank");

        expect(output.artifacts.length).toBe(4);

        // desktop snapshot must be a real Buffer
        const desktopImg = output.artifacts.find(a => a.section === "02_Exhibits/desktop_baseline");
        expect(Buffer.isBuffer(desktopImg.buffer)).toBe(true);
        expect(desktopImg.buffer.length).toBeGreaterThan(100); // Proves it's an actual byte array, not a mock string

        // mobile snapshot must be a real Buffer
        const mobileImg = output.artifacts.find(a => a.section === "02_Exhibits/mobile_baseline");
        expect(Buffer.isBuffer(mobileImg.buffer)).toBe(true);

        // findings JSON must contain real evaluated DOM logic
        const findings = output.artifacts.find(a => a.filename === "accessibility_findings.json");
        const parsedFindings = JSON.parse(findings.buffer);
        expect(parsedFindings.evaluations[0].context).toBe("desktop_baseline");
        expect(parsedFindings.evaluations[0].linkCount).toBeDefined(); // DOM evaluation property
    }, 30000);

});
