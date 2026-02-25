# Changelog

## 5.7.6
- Forensic smoke: engine/run_smoke.js emits [AF_ARTIFACT_DIR] with exact artifact folder
- Desktop and Mobile wrappers append ENV into the exact journal for that run
- verify:env script added, fails if newest journal lacks ENV
- package.json scripts locked to smoke:desktop, smoke:mobile, smoke:dual, matter, matter:triage, verify:env

