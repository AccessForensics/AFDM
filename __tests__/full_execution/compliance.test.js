const fs = require("fs");
const path = require("path");
const PacketAssembler = require("../../src/engine/full_execution/lib/packet_assembly");

describe("Packet Framework Review/Seal Boundaries", () => {

    test("PacketAssembler generates exact folder structure and excludes manifest initially", () => {
        const tmpDir = path.join(__dirname, "../../tmp/full_exec_out", "test_packet");
        const assembler = new PacketAssembler(tmpDir, "M-101", "OP-999");
        assembler.init();

        expect(fs.existsSync(path.join(tmpDir, "01_Report"))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, "02_Exhibits", "desktop_baseline"))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, "03_Verification"))).toBe(true);

        expect(fs.existsSync(path.join(tmpDir, "00_Manifest"))).toBe(false);
        expect(fs.existsSync(path.join(tmpDir, "01_Intake"))).toBe(false);
    });

    test("PacketAssembler workflow dictates staging review before sealing and verifies exact isomorphic payload copy", () => {
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

        // Deep payload parity assertion mapped to bytes, path, and hash identically.
        const reviewRecords = snapshotContent.records.map(r => ({ path: r.relative_filepath, sha256: r.sha256, bytes: r.bytes }));
        const finalRecords = finalManifestContent.records.filter(r => !r.filepath.includes("03_Verification")).map(r => ({ path: r.filepath, sha256: r.sha256, bytes: r.bytes }));

        expect(finalRecords).toEqual(reviewRecords);
    });

    test("PacketAssembler seal rejects missing file after review", () => {
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

    test("PacketAssembler seal rejects extra file added after review", () => {
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

    test("PacketAssembler seal rejects extra directory containing files added after review", () => {
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
        }).toThrow(/^Tamper detected: Alien file or directory introduced after review: 01_Report\/alien_folder\/alien\.txt$/);
    });

    test("PacketAssembler seal rejects empty directory added after review", () => {
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

    test("PacketAssembler seal rejects renamed file after review", () => {
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

    test("PacketAssembler seal rejects modified file after review", () => {
        const tmpDir = path.join(__dirname, "../../tmp/full_exec_out");
        const stageDir = path.join(tmpDir, "M-TAMPER-MOD_review_stage");
        const finalDir = path.join(tmpDir, "M-TAMPER-MOD_delivery_packet");

        const assembler = new PacketAssembler(stageDir, "M-TAMPER", "OP-999");
        assembler.init();
        assembler.writeRecord("01_Report", "data.txt", "Original data", "txt");
        assembler.stageForReview();

        fs.writeFileSync(path.join(stageDir, "01_Report", "data.txt"), "Tampered bytes", "utf8");

        expect(() => {
            PacketAssembler.sealFromReview(stageDir, finalDir, "OP");
        }).toThrow(/^Tamper detected: File 01_Report\/data\.txt was modified after review staging\.$/);
    });
});
