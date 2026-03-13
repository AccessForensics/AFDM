A. Repo snapshot
- current branch: `main` (the sandbox head currently points to a temporary branch identical to `main`, but `main` is the true state)
- relevant branches: `origin/main`, `origin/impl/full-exec-11-23-compliance-4746071512996527918`, `origin/fix-powershell-injection-12117177030281598860`
- relevant PRs: The remote branch structure implies PRs for full-exec compliance and powershell injection fixes, though these branches lack a common merge base with current `main`.
- merge conflicts: The `origin/impl/full-exec-11-23-compliance-4746071512996527918` and `origin/fix-powershell-injection-12117177030281598860` branches are fundamentally disjointed from `main` (no merge base) and contain massive deletion diffs of files that `main` already possesses, rendering them deeply conflicted and unmergeable in standard workflows.
- pending merges: There are no viable pending merges. The open feature branches are polluted dead-ends.

B. Main branch truth
- what Sections 11–23 related work is actually on main right now:
  - `src/engine/full_execution/run.js` exists, but it merely writes a `fail_closed.log` or seals an empty packet to preserve chain of custody without doing any actual browser or indexing work.
  - `src/engine/full_execution/lib/packet_assembly.js` exists and enforces the rigid 01_Report, 02_Exhibits, 03_Verification directory structure and manifest generation.
  - `src/engine/full_execution/lib/runtime_envelope.js` exists to assign operators and log scope deltas.
  - Verification schemas (`manifest_root_full.schema.json`, `custodial_transfer_log.schema.json`) are present.
  - There is ZERO actual Sections 11-23 execution-side logic, ZERO findings generation, and ZERO full-index-scan logic present on main. `main` only contains the empty shell of the Artifact Production framework masquerading as "full execution" integration.

C. Open PR truth
For each relevant PR or inferred PR branch:

- PR number if known: Inferred from branch name `4746071512996527918`
- title if known: 🧹 [description] Two-stage packet review/seal framework with anti-drift protections
- source branch: `origin/impl/full-exec-11-23-compliance-4746071512996527918`
- target branch: `main`
- mergeable or conflicted: Conflicted / Broken (No merge base with main, attempting to delete hundreds of lines that main relies on).
- clean or polluted history: Polluted.
- safe to merge now, yes or no: No.
- what it actually contains: Tweaks to packet assembly and test file deletions, but it entirely deletes the `src/engine/full_execution/run.js` and schemas rather than improving them. It is orphaned history.

- PR number if known: Inferred from branch name `12117177030281598860`
- title if known: 🔒 Fix command injection in PowerShell calls
- source branch: `origin/fix-powershell-injection-12117177030281598860`
- target branch: `main`
- mergeable or conflicted: Conflicted / Broken (No merge base).
- clean or polluted history: Polluted.
- safe to merge now, yes or no: No.
- what it actually contains: Security patches for PowerShell tools mixed with massive deletions of the `full_execution` folder.

D. Layered status
Separate status for:
- packet framework: Yes on main, basic folder assembly and validation schemas exist.
- artifact production: Yes on main, basic seal mechanics exist (`packet_seal.js`, `verify_packet.ps1`).
- execution engine: No. The script `run.js` is an empty shell that seals a blank packet.
- findings engine: No. Zero findings logic exists for Sections 11-23.
- full index scan: No. Zero full index scan logic exists.
- packet production readiness: Partially on main, but purely structural. It cannot produce a *real* packet because there is no execution engine to feed it data.

E. Safe salvage recommendation
- exactly what is safe to merge now, if anything: Nothing from the open branches is safe to merge. `main` must be the sole foundation going forward.

F. Blocked / reject list
- exactly what should not be merged now: Do NOT merge `origin/impl/full-exec-11-23-compliance-4746071512996527918` and do NOT merge `origin/fix-powershell-injection-12117177030281598860`. They are disconnected, polluted branches that will destroy `main`.

G. Branch split plan
- proposed clean Full Execution branch: Should be built fresh from `main` as `feat/11-23-full-execution`.
- proposed clean Artifact Production branch: Should be built fresh from `main` as `feat/artifact-production`.
- exact files/modules that belong in each:
  - **Artifact Production:** `src/engine/full_execution/lib/packet_assembly.js`, `src/engine/full_execution/schemas/manifest_root_full.schema.json`, `src/engine/full_execution/schemas/custodial_transfer_log.schema.json`, `src/engine/full_execution/schemas/operator_record.schema.json`, `src/engine/full_execution/schemas/transmittal_gate_record.schema.json`, `tools/packet_seal.js`, `tools/seal_packet.js`, `tools/verify_packet.ps1`.
  - **Full Execution:** `src/engine/full_execution/run.js`, `src/engine/full_execution/lib/runtime_envelope.js`, `src/engine/full_execution/schemas/scopedelta.schema.json`. (Plus all the missing logic for indexing and browser manipulation that needs to be written).
- exact mixed files/modules that must be separated: `src/engine/full_execution/` is currently a mixed bag. The directory name implies execution, but it primarily houses Artifact Production logic. The `run.js` file attempts to bind execution initialization and packet sealing together into one script, despite having no execution code.
- whether each branch can be salvaged from an existing branch/PR or must be rebuilt fresh: Both must be rebuilt fresh from `main`. The existing branches are unsalvageable.

H. Required work to achieve the split
- what must be moved: The entire packet assembly and cryptographic seal logic (`packet_assembly.js`, seal schemas) must be moved OUT of the `src/engine/full_execution/` directory and into a dedicated `src/artifact_production/` or `src/packet_framework/` directory to stop the false assumption that full execution is complete.
- what must be reverted: N/A (Main is the accepted baseline, just structurally confused).
- what must be rebuilt: A true `run.js` for Full Execution must be rebuilt to actually handle Sections 11-23 logic (indexing, finding generation) rather than just skipping to packet sealing.
- what must stay out because it is incomplete, misleading, polluted by mixed history, or belongs to the other branch: The open PR branches must stay out entirely.

I. Recommended merge order
- what should merge first: First, create the Artifact Production branch from `main`, extract and isolate the packet logic into its own namespace, and merge it back.
- what must remain separate: The Full Execution branch must remain completely separate and unmerged until *actual* browser capture and indexing logic is written to satisfy Sections 11-23.
- what should be closed or replaced: Close/abandon `origin/impl/full-exec-11-23-compliance-4746071512996527918` and `origin/fix-powershell-injection-12117177030281598860`. They are polluted and misleading. (If the powershell fix is needed, cherry-pick the single powershell script commit, not the branch).

J. Final blunt assessment
- one paragraph only
- brutally honest
- no smoothing language
- no “almost done”
- no over-crediting the box over the contents
The repository currently suffers from a severe conceptual bleed where the existence of empty folder scaffolding and manifest JSON schemas on `main` is being masqueraded as progress for Sections 11-23 full execution. There is absolutely zero actual indexing, execution, or finding generation logic present; `run.js` is merely a hollow shell that instantly writes a fail-closed log or seals a blank packet. The open feature branches are polluted dead-ends with completely broken histories that attempt to delete the very files they claim to improve. `main` is structurally confused, housing artifact generation under an execution namespace. To fix this, the open branches must be entirely abandoned, and `main` must be forcefully split: extract the packet assembly logic into a dedicated Artifact Production branch to stop the illusion of execution progress, and leave the Full Execution branch entirely empty until real browser capture code is actually written.