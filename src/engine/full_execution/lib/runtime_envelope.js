/**
 * Logic governing temporal logging, chain of custody, versioning,
 * retry and authorized lane handling (Sections 18 & 19).
 */

const { validateScopeDelta, validateOperatorRecord } = require("../validators/schema_validator");
const crypto = require("crypto");

class RuntimeEnvelope {
    constructor(matterId, operatorId) {
        this.matterId = matterId;
        this.operatorId = operatorId;
        this.version = "v1";
        this.scopeDeltas = [];
        this.operatorRecords = [];
        this.startTimeEpochMs = Date.now();
        this.startTimeLocal = new Date().toISOString();
    }

    assignOperator(independenceAttestation = true) {
        const record = {
            operator_id: this.operatorId,
            matter_id: this.matterId,
            assigned_timestamp_local: new Date().toISOString(),
            assigned_timestamp_epoch_ms: Date.now(),
            independence_attestation: independenceAttestation
        };

        const result = validateOperatorRecord(record);
        if (!result.valid) {
            throw new Error(`OperatorRecord invalid: ${JSON.stringify(result.errors)}`);
        }
        if (!independenceAttestation) {
            throw new Error("Independence attestation is false, operator disqualified (Section 22.6).");
        }
        this.operatorRecords.push(record);
        return record;
    }

    addScopeDelta(deltaData) {
        const deltaId = `sd_${crypto.randomBytes(8).toString("hex")}`;
        const record = {
            scope_delta_id: deltaId,
            matter_id: this.matterId,
            operator_id: this.operatorId,
            sealed_timestamp_local: new Date().toISOString(),
            sealed_timestamp_epoch_ms: Date.now(),
            ...deltaData
        };

        const result = validateScopeDelta(record);
        if (!result.valid) {
            throw new Error(`ScopeDelta invalid: ${JSON.stringify(result.errors)}`);
        }

        // Scope extensions are additive only (Section 11.6).
        this.scopeDeltas.push(record);
        return record;
    }

    generateTimestampContext() {
        return {
            local: new Date().toISOString(),
            epoch_ms: Date.now()
        };
    }

    handleConstraint(label, constraintClass) {
        if (label === "Constrained") {
            const allowed = ["BOTMITIGATION", "AUTHWALL", "GEOBLOCK", "HARDCRASH", "NAVIMPEDIMENT"];
            if (!allowed.includes(constraintClass)) {
                throw new Error(`Invalid constraint class: ${constraintClass}`);
            }
        } else {
            if (constraintClass) {
                throw new Error("Constraint class must be empty if outcome is not Constrained.");
            }
        }
        return { outcome_label: label, constraint_class: constraintClass || "" };
    }
}

module.exports = RuntimeEnvelope;
