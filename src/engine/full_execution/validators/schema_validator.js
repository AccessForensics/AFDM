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

const manifestRootSchema = loadSchema("manifest_root_full.schema.json");
const validateManifestRoot = ajv.compile(manifestRootSchema);

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
    validateManifestRoot: (data) => runValidation(validateManifestRoot, data, "ManifestRoot")
};
