# AUDIT PROTOCOL: ZERO-LEAK BOUNDARY VERIFICATION

## PURPOSE
A “clean build” is not sufficient. This protocol verifies a **Zero-Leak signature** across shipment surfaces that may expose auditor environment metadata. Any leak is a hard failure.

## BOUNDARY 1, BUILDER TRACKING NOTE (ARTIFACT TEXT)
**File:** `Deliverable_Packet\BUILDER_TRACKING_NOTE.txt`  
**Standard:** No absolute paths, no user tokens, no `tooling_bundle_path_abs`.

### REQUIRED CHECKS
- **Key ban:** `tooling_bundle_path_abs` must not appear
- **Windows anchor ban:** `C:\Users\` or `\\?\C:\Users\`
- **Unix anchor ban:** `/Users/<name>/` and `/home/<name>/`
- **WSL anchor ban:** `/mnt/<drive>/Users/<name>/`
- **Username ban:** local OS username token must not appear

## BOUNDARY 2, JSON MANIFEST (ARTIFACT METADATA)
**Risk:** Manifests can persist absolute paths during artifact collection or build provenance stamping.

### VERIFICATION COMMANDS
- **PowerShell:** `Select-String -Path manifest.json -Pattern "([A-Za-z]:\\Users\\)|(/Users/[^/]+/)|(/home/[^/]+/)|(/mnt/[a-z]/Users/[^/]+/)" -SimpleMatch:$false`
- **Standard:** Any hit is an immediate execution failure.

## BOUNDARY 3, ZIP HEADER INSPECTION (ARCHIVE METADATA)
Zip utilities may persist absolute paths or host-root anchors inside the central directory if path normalization is incorrect.

### VERIFICATION COMMANDS
- Preferred: `7z l -slt Deliverable_Packet_*.zip`
- Alternate: `unzip -v Deliverable_Packet_*.zip`

### STANDARD
- No entries may start with drive letters (example, `C:\`)
- No entries may start at host root (example, `/Users/`, `/home/`, `\Users\`)
- No entries may include path traversal (`..\` or `../`)
- All archive paths must be bundle-relative

## CROSS-SURFACE CONSISTENCY TABLE

| COMPONENT | REQUIREMENT | ENFORCEMENT |
| --- | --- | --- |
| BUILDER_TRACKING_NOTE.txt | No `tooling_bundle_path_abs`, no absolute paths | write-boundary sanitize + validator |
| manifest.json | Relative paths only, no environment anchors | validator |
| console output | No user-specific tokens | validator (surface checks only) |
| zip structure | Bundle-relative only, no absolute, no traversal | validator |

## NEXT STEP
Use `tools\manifest_validator.js` as a pre-shipment hard gate. Any failure blocks delivery.
