const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

describe("Full Execution (Sections 11-23) Compliance", () => {
    // We isolate schema require inside test to prove immediate throw
    test("Layer 1/2/3: Validator rejects missing Shared Schemas (Initialization Fail-Closed)", () => {
        const { execSync } = require("child_process");

        // Temporarily move the capture_unit schema
        const targetPath = path.join(__dirname, "../../src/engine/schemas/capture_unit.schema.json");
        const backupPath = path.join(__dirname, "../../src/engine/schemas/capture_unit.schema.json.bak");
        fs.renameSync(targetPath, backupPath);

        // We must clear the require cache so it actually reloads

        let errorThrown = false;
        try {
            // Run node explicitly requiring the validator in a new process to avoid jest cache and top-level crash issues
            execSync("node -e \"require('./src/engine/full_execution/validators/schema_validator')\"", { cwd: path.join(__dirname, "../../") });
        } catch (e) {
            errorThrown = true;
            expect(e.stderr.toString()).toMatch(/ENOENT/);
        }
        expect(errorThrown).toBe(true);


        // Restore immediately
        fs.renameSync(backupPath, targetPath);
        // Reload healthy cache
        delete require.cache[require.resolve("../../src/engine/full_execution/validators/schema_validator")];
    });

    // Now safely load real modules
    const PacketAssembler = require("../../src/engine/full_execution/lib/packet_assembly");
    const RuntimeEnvelope = require("../../src/engine/full_execution/lib/runtime_envelope");
    const { validateInteractionPlan, validateCaptureUnit, validateManifestRoot, validateTransmittalGate } = require("../../src/engine/full_execution/validators/schema_validator");

    const validFixture = require("../../fixtures/full_execution/deterministic_valid.json");
    const failFixture = require("../../fixtures/full_execution/deterministic_fail.json");
    const dummyHash = crypto.createHash("sha256").update("dummy_template").digest("hex");

    test("Layer 1/2/3: Runtime Envelope enforces operator attestation (Section 22)", () => {
        const envelope = new RuntimeEnvelope(validFixture.matter_id, validFixture.operator_id);
        const opRec = envelope.assignOperator(validFixture.independence_attestation);
        expect(opRec.independence_attestation).toBe(true);
        expect(opRec.matter_id).toBe("M-101");
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
        expect(delta.authority_type).toBe("ENGAGEMENT_ADDENDUM");
        expect(delta.operator_id).toBe("OP-999");
    });

    test("Layer 1/2/3: PacketAssembler generates exact folder structure (Section 15.2)", () => {
        const tmpDir = path.join(__dirname, "../../tmp/full_exec_out", "test_packet");
        const assembler = new PacketAssembler(tmpDir, "M-101", "OP-999");
        assembler.init();

        expect(fs.existsSync(path.join(tmpDir, "01_Report"))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, "02_Exhibits", "desktop_baseline"))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, "03_Verification"))).toBe(true);

        expect(fs.existsSync(path.join(tmpDir, "00_Manifest"))).toBe(false); // Banned
        expect(fs.existsSync(path.join(tmpDir, "01_Intake"))).toBe(false); // Banned
    });

    test("Layer 1/2/3: PacketAssembler handles constraint dictionaries strictly", () => {
        const envelope = new RuntimeEnvelope("M-101", "OP-999");
        expect(() => {
            envelope.handleConstraint("Constrained", "INVALID_CONSTRAINT");
        }).toThrow("Invalid constraint class");

        expect(() => {
            envelope.handleConstraint("InvalidOutcome", "BOTMITIGATION");
        }).toThrow("Invalid outcome label");

        const valid = envelope.handleConstraint("Constrained", "BOTMITIGATION");
        expect(valid.outcome_label).toBe("Constrained");
        expect(valid.constraint_class).toBe("BOTMITIGATION");
    });

    test("Layer 1/2/3: PacketAssembler derives interim template authority strictly from root package.json", () => {
        const tmpDir = path.join(__dirname, "../../tmp/full_exec_out", "test_packet_templates");
        const assembler = new PacketAssembler(tmpDir, "M-101", "OP-999");
        assembler.init();
        // Since it reads from the real repo root, it should succeed
        expect(() => {
            assembler.seal("valid_transmittable");
        }).not.toThrow();

        // We can also prove the generated manifest contains real non-dummy hashes
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

    test("Layer 1/2/3: Validator rejects invalid Shared Schema (InteractionPlan)", () => {
        const junkPlan = {
            allegation_id: "a-1",
            context_id: "desktop_baseline",
            start_url: "https://example.com" // Missing required 'target_state_description', 'permitted_actions', etc.
        };
        const result = validateInteractionPlan(junkPlan);
        expect(result.valid).toBe(false);
    });

    test("Layer 1/2/3: Validator rejects invalid Shared Schema (CaptureUnit)", () => {
        const junkCU = {
            matter_id: "M-101",
            outcome_label: "Not a real label" // Fails enum and missing dozens of properties
        };
        const result = validateCaptureUnit(junkCU);
        expect(result.valid).toBe(false);
    });

    test("Layer 1/2/3: Validator rejects invalid ManifestRoot structure", () => {
        const junkManifest = {
            matter_id: "M-101",
            packet_version: "v1", // Missing multiple required fields (operator_id, records, etc.)
            records: [
                { filepath: "InvalidFolder/test.txt", sha256: "notahash", bytes: -1 }
            ]
        };
        const result = validateManifestRoot(junkManifest);
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

        const invalidGate = { ...validGate, hash_chain_verified: false }; // Breaks 'const' requirement
        expect(validateTransmittalGate(invalidGate).valid).toBe(false);
    });

    test("Layer 1/2/3: Manifest Semantics explicitly exclude packet_seal.txt to prevent cyclic binding", () => {
        const tmpDir = path.join(__dirname, "../../tmp/full_exec_out", "test_manifest_semantics");
        const assembler = new PacketAssembler(tmpDir, "M-101", "OP-999");
        assembler.init();

        assembler.writeRecord("01_Report", "evidence.txt", "Some evidence data", "txt");
        assembler.seal("valid_transmittable", "1.0.0", dummyHash);

        // Before generating output, verify what the assembler tracked.
        const trackedFiles = assembler.records.map(r => r.filepath);
        expect(trackedFiles.includes("01_Report/evidence.txt")).toBe(true);
        expect(trackedFiles.includes("03_Verification/manifest.json")).toBe(true); // writeRecord adds it AFTER manifestObj is built
        expect(trackedFiles.includes("03_Verification/packet_seal.txt")).toBe(false);

        const sealOutput = assembler.generateVerificationOutputs();

        // Assert file exists physically, but was excluded from the cyclic manifest
        expect(fs.existsSync(path.join(tmpDir, "03_Verification", "manifest.json"))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, "03_Verification", "packet_seal.txt"))).toBe(true);
        expect(sealOutput.sealHash).toMatch(/^[a-f0-9]{64}$/);
    });

    test("Layer 1/2/3: PacketAssembler workflow dictates staging review before sealing", () => {
        const tmpDir = path.join(__dirname, "../../tmp/full_exec_out");
        const stageDir = path.join(tmpDir, "M-STAGE-1_review_stage");
        const finalDir = path.join(tmpDir, "M-STAGE-1_delivery_packet");

        // Phase 1: Stage
        const assembler = new PacketAssembler(stageDir, "M-STAGE-1", "OP-999");
        assembler.init();
        assembler.writeRecord("01_Report", "data.txt", "Some captured data", "txt");
        assembler.stageForReview();

        // Assert review artifact exists but is not sealed
        expect(fs.existsSync(path.join(stageDir, "REVIEW_viewer.html"))).toBe(true);
        expect(fs.existsSync(path.join(stageDir, "state_snapshot.json"))).toBe(true);
        expect(fs.existsSync(path.join(stageDir, "03_Verification", "packet_seal.txt"))).toBe(false);

        // Assert view HTML strictly marks itself
        const html = fs.readFileSync(path.join(stageDir, "REVIEW_viewer.html"), "utf8");
        expect(html).toContain("REVIEW ONLY / NOT FINAL / NON-CANONICAL");

        // Phase 2: Seal
        const sealResult = PacketAssembler.sealFromReview(stageDir, finalDir, "OP-999");

        // Assert final packet is strictly sealed and clean
        expect(fs.existsSync(path.join(finalDir, "03_Verification", "packet_seal.txt"))).toBe(true);
        expect(fs.existsSync(path.join(finalDir, "01_Report", "data.txt"))).toBe(true);
        expect(fs.existsSync(path.join(finalDir, "REVIEW_viewer.html"))).toBe(false);
        expect(fs.existsSync(path.join(finalDir, "state_snapshot.json"))).toBe(false);
        expect(sealResult.sealHash).toMatch(/^[a-f0-9]{64}$/);
    });

    test("Layer 1/2/3: PacketAssembler rejects sealing if staging files were tampered with", () => {
        const tmpDir = path.join(__dirname, "../../tmp/full_exec_out");
        const stageDir = path.join(tmpDir, "M-TAMPER-1_review_stage");
        const finalDir = path.join(tmpDir, "M-TAMPER-1_delivery_packet");

        const assembler = new PacketAssembler(stageDir, "M-TAMPER-1", "OP-999");
        assembler.init();
        assembler.writeRecord("01_Report", "data.txt", "Some original data", "txt");
        assembler.stageForReview();

        // TAMPER THE FILE AFTER REVIEW BUT BEFORE SEAL
        fs.writeFileSync(path.join(stageDir, "01_Report", "data.txt"), "Hacked data", "utf8");

        expect(() => {
            PacketAssembler.sealFromReview(stageDir, finalDir, "OP-999");
        }).toThrow("Tamper detected: File 01_Report/data.txt was modified after review staging.");
    });
});
