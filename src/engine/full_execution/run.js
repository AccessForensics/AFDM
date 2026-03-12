#!/usr/bin/env node
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const PacketAssembler = require("./lib/packet_assembly");
const RuntimeEnvelope = require("./lib/runtime_envelope");
const FullExecutionEngine = require("./lib/execution_engine");

const args = process.argv.slice(2);
const isStage = args.includes("--stage-review");
const isSeal = args.includes("--seal-approved");
const positional = args.filter(a => !a.startsWith("--"));

if (!isStage && !isSeal) {
    console.error("Usage: node src/engine/full_execution/run.js [--stage-review | --seal-approved] <matter_id> <operator_id>");
    process.exit(1);
}

if (positional.length < 2) {
    console.error("Missing required positional arguments. <matter_id> <operator_id>");
    process.exit(1);
}

const [matterId, operatorId] = positional;

const reviewStageDir = path.join(process.cwd(), "tmp/full_exec_out", `${matterId}_review_stage`);
const finalDeliveryDir = path.join(process.cwd(), "tmp/full_exec_out", `${matterId}_delivery_packet`);

(async () => {
    try {
        if (isStage) {
            console.log(`[FullExec] Stage 1: Building PRE-DELIVERY REVIEW ARTIFACT for ${matterId}`);
            const envelope = new RuntimeEnvelope(matterId, operatorId);
            envelope.assignOperator(true);

            const assembler = new PacketAssembler(reviewStageDir, matterId, operatorId);
            assembler.init();

            const executionOutput = await FullExecutionEngine.run(matterId);

            executionOutput.artifacts.forEach(artifact => {
                assembler.writeRecord(artifact.section, artifact.filename, artifact.buffer, artifact.type);
            });

            assembler.stageForReview();
            console.log(`[FullExec] Review staging complete at: ${reviewStageDir}`);
            console.log(`[FullExec] Open ${path.join(reviewStageDir, "REVIEW_viewer.html")} to verify contents. Packet is NOT sealed.`);
        } else if (isSeal) {
            console.log(`[FullExec] Stage 2: Ingesting review staging and building FINAL SEALED PACKET for ${matterId}`);

            const sealResult = PacketAssembler.sealFromReview(reviewStageDir, finalDeliveryDir, operatorId);
            console.log(`[FullExec] Final seal applied successfully.`);
            console.log(`[FullExec] Canonical Packet Location: ${finalDeliveryDir}`);
            console.log(`[FullExec] Verified Seal Hash: ${sealResult.sealHash}`);
        }

    } catch (err) {
        console.error("[FullExec] Execution failed.");
        console.error(err.message);
        process.exit(1);
    }
})();
