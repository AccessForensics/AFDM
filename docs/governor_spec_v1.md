# Hard Lock Governor Spec v1 (Repo-Truth Alignment)

Status: HARD-LOCKED FOR THIS REPO STATE
Date: 2026-02-11

## 0. Reality Check (Non-Negotiable)
As of this revision, the repository contains:
- engine/run_smoke_desktop.js and engine/run_smoke_mobile.js envelope wrappers
- engine/run_smoke.js canonical smoke runner
- tools/verify_env.js CI gate verification

The repository does NOT contain:
- engine/matter_runner.js
- packet hierarchy generator
- index.json and packet_hash.txt sealing logic
- shared/utils.js (added by this PR)

Therefore, any claim that the Matter Runner or hierarchical sealing is "already implemented" is false unless proven by file presence and commit history.

## 1. Current Deterministic Envelopes (What Exists)
Desktop wrapper forces:
- env_label: DESKTOP
- viewport: 1366x768 (default)
- isMobile: false
- hasTouch: false

Mobile wrapper forces:
- env_label: MOBILE_EMULATION
- viewport: 390x844 (default)
- isMobile: true
- hasTouch: true

Both wrappers:
- parse [AF_ARTIFACT_DIR] from run_smoke.js output
- append an ENV record into journal.ndjson including version and git_sha

## 2. CI Gate (What Must Not Break)
GitHub Actions runs:
- npm run gate:smoke
which executes:
- smoke:dual (desktop then mobile) and verify:env

verify:env requires:
- newest two journals contain ENV records
- env_label includes DESKTOP and MOBILE_EMULATION
- ENV version and git_sha match current HEAD

## 3. Next Hard Lock Layer (Introduced Here)
This spec introduces a repo-level sealing primitive:
- tools/seal_packet.js creates:
  - index.json (deterministic list of file hashes, lexicographically sorted)
  - packet_hash.txt (sha256(index.json))
- packet_hash.txt is excluded from index.json to prevent circularity.

## 4. env_hash Standard
This repo will compute env_hash using canonical recursive key ordering.
Minimum env_hash length: 16 hex characters (64-bit).
Rationale: 8 hex (32-bit) is insufficient for scaled forensic operation.

## 5. Implementation Constraint
No "Matter Runner" may be merged unless:
- docs/governor_spec_v1.md exists in repo
- the runner produces index.json and packet_hash.txt using deterministic ordering
- the runner produces artifacts without timestamps embedded in filenames (future patch)
