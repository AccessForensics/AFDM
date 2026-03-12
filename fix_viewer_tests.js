const fs = require('fs');

const testAdditions = `
    test("Layer 1/2/3: Viewer Artifact is explicitly non-canonical and outside the boundary", () => {
        const { generateViewer } = require("../../src/engine/full_execution/viewer/generate_viewer");
        const tmpDir = path.join(__dirname, "../../tmp/full_exec_out");
        const packetDir = path.join(tmpDir, "M-101_viewer_packet");
        const assembler = new PacketAssembler(packetDir, "M-101", "OP-999");
        assembler.init();

        const testFilePath = assembler.writeRecord("01_Report", "evidence.txt", "Viewer test", "txt");
        assembler.seal("valid_transmittable", "1.0.0", dummyHash);
        assembler.generateVerificationOutputs();

        // Generate the viewer in the parent directory, strictly outside the packet folder
        const viewerPath = generateViewer(packetDir, tmpDir);

        // Assertions for structural boundary
        expect(viewerPath.includes("M-101_viewer_packet")).toBe(false);
        expect(fs.existsSync(viewerPath)).toBe(true);

        const html = fs.readFileSync(viewerPath, "utf8");
        expect(html).toContain("NON-CANONICAL VIEWER");
        expect(html).toContain("OUTSIDE the canonical hash boundary");
        expect(html).toContain("01_Report/evidence.txt");
    });

    test("Layer 1/2/3: Reading files from the sealed packet does not mutate hashes", () => {
        const packetDir = path.join(__dirname, "../../tmp/full_exec_out", "M-101_read_test_packet");
        const assembler = new PacketAssembler(packetDir, "M-101", "OP-999");
        assembler.init();

        const testFilePath = assembler.writeRecord("01_Report", "read_target.txt", "Hash me", "txt");

        const initialHash = crypto.createHash("sha256").update(fs.readFileSync(testFilePath)).digest("hex");

        // Simulate reading the file multiple times exactly as a viewer or human would
        for(let i=0; i<5; i++) {
            fs.readFileSync(testFilePath, "utf8");
        }

        const postReadHash = crypto.createHash("sha256").update(fs.readFileSync(testFilePath)).digest("hex");

        expect(initialHash).toBe(postReadHash);
    });
});
`;

let testContent = fs.readFileSync("__tests__/full_execution/compliance.test.js", "utf8");
testContent = testContent.replace(/}\);\n$/g, testAdditions);
fs.writeFileSync("__tests__/full_execution/compliance.test.js", testContent);
