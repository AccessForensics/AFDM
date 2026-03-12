const fs = require('fs');

let testContent = fs.readFileSync("__tests__/full_execution/compliance.test.js", "utf8");

// Remove the older viewer generator tests which are now obsolete and replace them with the two-stage lifecycle tests.
testContent = testContent.replace(
    /test\("Layer 1\/2\/3: Viewer Artifact is explicitly non-canonical[\s\S]*\}\);/gm,
    `test("Layer 1/2/3: PacketAssembler workflow dictates staging review before sealing", () => {
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
        const sealResult = PacketAssembler.sealFromReview(stageDir, finalDir, "OP-999", "1.0", dummyHash);

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
            PacketAssembler.sealFromReview(stageDir, finalDir, "OP-999", "1.0", dummyHash);
        }).toThrow("Tamper detected: File 01_Report/data.txt was modified after review staging.");
    });
});`
);

fs.writeFileSync("__tests__/full_execution/compliance.test.js", testContent);
