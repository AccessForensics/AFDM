# TEST AUTHORITY — Access Forensics SKU-A v3.5

## Purpose

This document defines the authoritative test reference for Access Forensics SKU-A v3.5.

It exists to prevent post-hoc reinterpretation, selective citation, or ambiguity regarding test validity, scope, or finality.

Any test results, claims of compliance, representations of system behavior, or external citations must anchor to the authority defined in this document.

---

## Authoritative Reference

### Primary Authority Tag

- Tag: `v3.5-authority`
- Commit: `1f8b429`
- Branch alignment: `main`, `origin/main`, and `origin/HEAD` all point to this commit

This tag represents the complete, deterministic, and finalized test authority for Access Forensics SKU-A v3.5, including both the test suite and the authority documentation itself.

No commits after this tag modify executor behavior, test logic, verification criteria, or authority definitions for v3.5.

---

## Relationship to Other Tags

The following tags exist for historical or developmental reference only and are not authoritative:

- `v3.5.0`  
  Product freeze for SKU-A v3.5 executor behavior.

- `v3.5-tests-complete`  
  Historical marker indicating completion of the deterministic test suite. Superseded by `v3.5-authority` as the citation anchor.

- `v3.5-test02-pass`  
  Intermediate validation milestone.

- `v3.5-tests01-03`  
  Early test aggregation tag.

- `v3.5-tests01-03-renormalized`  
  Normalized revision of early test aggregation.

These tags must not be cited as proof of final system behavior or compliance.

---

## Scope of the Authoritative Test Suite

The authoritative test suite enforces, at minimum, the following invariants:

- Deterministic step indexing
- Strict selector ambiguity hard-fail behavior where more than one match is found
- Policy gate enforcement distinguishing passive capture from interactive actions
- Explicit misuse and policy violation classification written to `STATUS.txt`
- Sealed failure behavior where failed runs still produce complete deliverable packets
- Mandatory manifest inclusion of:
  - `STATUS.txt`
  - `Execution_Report.txt`
  - `interaction_log.json`
  - `flow_plan.sealed.json`
  - `run_metadata.json`
  - `packet_hash.txt`
- URL provenance logging with sealed start and final URLs
- Deterministic verification using PowerShell-based harnesses

All tests are repeatable, non-heuristic, non-probabilistic, and non-interpretive.

---

## Finality Statement

As of tag `v3.5-authority`, the Access Forensics SKU-A v3.5 test suite and authority definition are final, complete, and non-evolving.

Any future changes to executor behavior, test logic, verification criteria, or authority definitions require:
- A new semantic version
- A new authority document
- A new authority tag

---

## Usage Guidance

When referencing Access Forensics SKU-A v3.5 in documentation, analysis, testimony, audits, or external communications:

- Cite `v3.5-authority`
- Reference this document
- Avoid referencing branch tips, local runs, intermediate tags, or historical test milestones

Reliance on any reference other than `v3.5-authority` constitutes use of non-authoritative material.

---

## Custody and Integrity Note

This repository preserves full commit history, tags, and test artifacts.

Authority is established by cryptographic commit hashes and annotated tags, not by narrative description or external interpretation.
