const Ajv = require("ajv");
const addFormats = require("ajv-formats");
const fs = require("fs");
const path = require("path");

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const schemasDir = path.join(__dirname, "../schemas");

function loadSchema(filename) {
    const raw = fs.readFileSync(path.join(schemasDir, filename), "utf-8");
    return JSON.parse(raw);
}

// Full execution specific schemas
const scopeDeltaSchema = loadSchema("scopedelta.schema.json");
const operatorRecordSchema = loadSchema("operator_record.schema.json");
const transmittalGateRecordSchema = loadSchema("transmittal_gate_record.schema.json");
const custodialTransferLogSchema = loadSchema("custodial_transfer_log.schema.json");
const manifestRootSchema = loadSchema("manifest_root_full.schema.json");

const validateScopeDelta = ajv.compile(scopeDeltaSchema);
const validateOperatorRecord = ajv.compile(operatorRecordSchema);
const validateTransmittalGate = ajv.compile(transmittalGateRecordSchema);
const validateCustodialTransfer = ajv.compile(custodialTransferLogSchema);
const validateManifestRoot = ajv.compile(manifestRootSchema);

// Existing shared schemas MUST fail-closed if missing
const sharedSchemasDir = path.join(__dirname, "../../schemas");
const captureUnitSchema = JSON.parse(fs.readFileSync(path.join(sharedSchemasDir, "capture_unit.schema.json"), "utf-8"));
const interactionPlanSchema = JSON.parse(fs.readFileSync(path.join(sharedSchemasDir, "interaction_plan.schema.json"), "utf-8"));

const validateCaptureUnit = ajv.compile(captureUnitSchema);
const validateInteractionPlan = ajv.compile(interactionPlanSchema);

function runValidation(validateFn, data, schemaName) {
    const valid = validateFn(data);
    if (!valid) {
        return {
            valid: false,
            errors: validateFn.errors
        };
    }
    return { valid: true };
}

module.exports = {
    validateScopeDelta: (data) => runValidation(validateScopeDelta, data, "ScopeDelta"),
    validateOperatorRecord: (data) => runValidation(validateOperatorRecord, data, "OperatorRecord"),
    validateTransmittalGate: (data) => runValidation(validateTransmittalGate, data, "TransmittalGateRecord"),
    validateCustodialTransfer: (data) => runValidation(validateCustodialTransfer, data, "CustodialTransferLog"),
    validateManifestRoot: (data) => runValidation(validateManifestRoot, data, "ManifestRoot"),
    validateCaptureUnit: (data) => runValidation(validateCaptureUnit, data, "CaptureUnit"),
    validateInteractionPlan: (data) => runValidation(validateInteractionPlan, data, "InteractionPlan")
};
