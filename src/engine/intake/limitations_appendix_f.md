---
limitation_id: LIMITATION-INTAKE-T3-GAP-001
doctrine_section: AF 1-23 / Intake Outputs
requirement_summary: AF 1-23 locks 6 permitted external intake determinations, including Template 3 (ELIGIBLE FOR DESKTOP TECHNICAL RECORD BUILD / MOBILE BASELINE: CONSTRAINED). Fixture D.3 is required for Template 3.
current_state: The engine defines all 6 enums. However, AFIntakeTemplate.pdf only provides canonical body text for 4 templates (T1, T2, T4, T5/T6). The resolver cannot synthesize non-canonical text for T3.
why_not_enforced: Synthesizing an unapproved template violates governance rules against improvising determination payloads.
risk_if_unaddressed: A real intake run hitting the T3 outcome will lack external messaging output, causing a pipeline failure.
temporary_controls: The resolveTemplate function explicitly hard-fails if T3 is requested, throwing a defined error.
tests_missing_or_partial: End-to-end integration tests for T3 generation cannot be written until a template exists.
fixtures_missing_or_partial: Fixture D.3 is missing and cannot be generated.
expected_failure_mode: Hard fail on T3 resolution at execution time.
blocks_completion: true
planned_followup: Await canonical governed text for T3 to be added to AFIntakeTemplate.pdf.
---

# Appendix F: Limitations and Doctrine Gaps
This file formally registers limitations against the AF 1-23 machine-bindable spec. The metadata above conforms to the mandatory Appendix F fields.