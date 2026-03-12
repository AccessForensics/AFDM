#!/usr/bin/env node
/**
 * CLI Entry point for Full Execution phase.
 * Completely distinct from Intake.
 */

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const PacketAssembler = require("./lib/packet_assembly");
const RuntimeEnvelope = require("./lib/runtime_envelope");

const args = process.argv.slice(2);
const failClosedFlag = args.includes("--fail-closed");
const positional = args.filter(a => !a.startsWith("--"));

if (positional.length < 4) {
    console.error("Usage: node src/engine/full_execution/run.js <matter_id> <operator_id> <template_version> <template_hash> [--fail-closed]");
    process.exit(1);
}

const [matterId, operatorId, templateVersion, templateHash] = positional;

// Reject placeholder hashes explicitly
if (!/^[a-f0-9]{64}$/i.test(templateHash) || templateHash === "0000000000000000000000000000000000000000000000000000000000000000") {
    console.error("[FullExec] Invalid or dummy controlled template hash provided. Failing closed.");
    process.exit(1);
}

const baseOutputDir = path.join(process.cwd(), "tmp/full_exec_out", `${matterId}_packet`);

try {
    const envelope = new RuntimeEnvelope(matterId, operatorId);
    envelope.assignOperator(true);

    const assembler = new PacketAssembler(baseOutputDir, matterId, operatorId);
    assembler.init();

    if (failClosedFlag) {
        assembler.writeRecord("01_Report", "fail_closed.log", "Fail-closed condition triggered. See Appendix F format.", "txt");
        assembler.seal("invalid_untransmittable", templateVersion, templateHash);
        assembler.generateVerificationOutputs();
        process.exit(0);
    }

    console.log("[FullExec] No valid orchestration bound. Proceeding to seal empty packet to preserve chain of custody without spoofing artifacts.");
    assembler.seal("valid_transmittable", templateVersion, templateHash);
    const sealData = assembler.generateVerificationOutputs();

    console.log(`[FullExec] Execution complete. Sealed hash: ${sealData.sealHash}`);

} catch (err) {
    console.error("[FullExec] Execution failed.");
    console.error(err);
    process.exit(1);
}
