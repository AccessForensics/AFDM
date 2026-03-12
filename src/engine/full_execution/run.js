#!/usr/bin/env node
/**
 * CLI Entry point for Full Execution phase.
 * Completely distinct from Intake.
 */

const path = require("path");
const fs = require("fs");
const PacketAssembler = require("./lib/packet_assembly");
const RuntimeEnvelope = require("./lib/runtime_envelope");

const args = process.argv.slice(2);
if (args.length < 2) {
    console.error("Usage: node src/engine/full_execution/run.js <matter_id> <operator_id> [--fail-closed]");
    process.exit(1);
}

const matterId = args[0];
const operatorId = args[1];
const failClosedFlag = args.includes("--fail-closed");

const baseOutputDir = path.join(process.cwd(), "tmp/full_exec_out", `${matterId}_packet`);

console.log(`[FullExec] Starting full execution build for matter: ${matterId} by operator: ${operatorId}`);
console.log(`[FullExec] Target output: ${baseOutputDir}`);

try {
    // 1. Init Envelope and Assemblies
    const envelope = new RuntimeEnvelope(matterId, operatorId);

    // Assign operator with attestation constraint check (22.6)
    envelope.assignOperator(true);

    if (failClosedFlag) {
        console.log("[FullExec] Fail-closed test trigger detected. Generating limitations log and aborting normal flow.");
        // If fail-closed logic forces early abort:
        const assembler = new PacketAssembler(baseOutputDir, matterId, operatorId);
        assembler.init();
        assembler.writeRecord("01_Report", "fail_closed.log", "Fail-closed condition triggered. See Appendix F format.", "txt");
        assembler.seal("invalid_untransmittable");
        assembler.generateVerificationOutputs();
        process.exit(0);
    }

    const assembler = new PacketAssembler(baseOutputDir, matterId, operatorId);
    assembler.init();

    // 2. Mocking an execution flow
    // Write a dummy capture unit artifact to Exhibits/desktop_baseline
    const captureUnitMock = {
        matter_id: matterId,
        allegation_id: "allegation-01",
        context_id: "desktop_baseline",
        capture_unit_id: "cu_01",
        run_id: "run_01",
        start_url: "https://example.com",
        final_url: "https://example.com/done",
        outcome_label: "Observed as asserted",
        constraint_class: "",
        timestamps_start_local: envelope.generateTimestampContext().local,
        timestamps_start_epoch_ms: envelope.generateTimestampContext().epoch_ms,
        timestamps_end_local: envelope.generateTimestampContext().local,
        timestamps_end_epoch_ms: envelope.generateTimestampContext().epoch_ms,
        operator_id: operatorId,
        interaction_plan_ref: "matter_id::allegation_id::ip_01",
        navimpediment_retry: false,
        pre_change_state: true
    };

    // The PacketAssembler automatically hashes writes and stores the lineage in records list
    assembler.writeRecord("02_Exhibits/desktop_baseline", "cu_01.json", captureUnitMock, "json");

    // 3. Seal the packet
    console.log("[FullExec] Finalizing packet and sealing...");
    assembler.seal("valid_transmittable");
    const sealData = assembler.generateVerificationOutputs();

    console.log(`[FullExec] Execution complete. Sealed hash: ${sealData.sealHash}`);

} catch (err) {
    console.error("[FullExec] Execution failed.");
    console.error(err);
    process.exit(1);
}
