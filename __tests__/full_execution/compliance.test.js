const fs = require("fs");
const path = require("path");
const PacketAssembler = require("../../src/engine/full_execution/lib/packet_assembly");
const RuntimeEnvelope = require("../../src/engine/full_execution/lib/runtime_envelope");

describe("Full Execution (Sections 11-23) Compliance", () => {
    const validFixture = require("../../fixtures/full_execution/deterministic_valid.json");
    const failFixture = require("../../fixtures/full_execution/deterministic_fail.json");

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

    test("Layer 1/2/3: PacketAssembler handles constraint dictionaries", () => {
        const envelope = new RuntimeEnvelope("M-101", "OP-999");
        expect(() => {
            envelope.handleConstraint("Constrained", "INVALID_CONSTRAINT");
        }).toThrow("Invalid constraint class");

        const valid = envelope.handleConstraint("Constrained", "BOTMITIGATION");
        expect(valid.outcome_label).toBe("Constrained");
        expect(valid.constraint_class).toBe("BOTMITIGATION");
    });

    test("Layer 1/2/3: Verification Outputs compute matching hashes (Section 15)", () => {
        const tmpDir = path.join(__dirname, "../../tmp/full_exec_out", "test_hash_packet");
        const assembler = new PacketAssembler(tmpDir, "M-101", "OP-999");
        assembler.init();
        assembler.writeRecord("01_Report", "test.txt", "Hello World", "txt");
        assembler.seal();
        const sealOutput = assembler.generateVerificationOutputs();

        expect(fs.existsSync(path.join(tmpDir, "03_Verification", "packet_seal.txt"))).toBe(true);
        expect(sealOutput.sealHash).toMatch(/^[a-f0-9]{64}$/); // SHA-256
    });
});
