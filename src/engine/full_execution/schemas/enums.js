/**
 * Layer 3 Enums mapped to Doctrine Sections 18, 20, 22
 */
module.exports = {
    CONSTRAINT_CLASSES: [
        "BOTMITIGATION", "AUTHWALL", "GEOBLOCK", "HARDCRASH", "NAVIMPEDIMENT"
    ],
    SCOPE_DELTA_TYPES: [
        "ADDITIVE_URL", "ADDITIVE_STEP", "ADDITIVE_ALLEGATION", "AUTHORIZED_LANE"
    ],
    AUTHORITY_TYPES: [
        "ENGAGEMENT_ADDENDUM", "COUNSEL_EMAIL", "PORTAL_INSTRUCTION"
    ],
    TRANSMITTAL_STATUS: [
        "valid_transmittable", "invalid_untransmittable"
    ],
    ALLOWED_TRANSMITTAL_METHODS: [
        "encrypted_email", "secure_portal", "secure_file_transfer"
    ],
    AUTHORITY_BASIS_REOPEN: [
        "WRITTEN_COUNSEL_REQUEST", "COURT_ORDER", "INTERNAL_INTEGRITY_VERIFICATION"
    ],
    OUTCOME_LABELS: [
        "Observed as asserted",
        "Not observed as asserted",
        "Constrained",
        "Insufficiently specified for bounded execution"
    ]
};
