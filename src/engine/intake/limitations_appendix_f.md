# Limitations and Doctrine Gaps (Appendix F)

- **limitation_id:** LIMITATION-INTAKE-T3-GAP-001
- **doctrine_section:** AF 1-23 / Intake Outputs
- **requirement_summary:** Intake must output one of six specific canonical markdown determinations, including T3 (`ELIGIBLE FOR DESKTOP TECHNICAL RECORD BUILD / MOBILE BASELINE: CONSTRAINED`). AF 1-23 also requires Fixture D.3 to prove it.
- **current_state:** The `engine/intake/enums.js` defines the 6 locked templates. However, `AFIntakeTemplate.pdf` only provides authoritative body text for 4 templates (T1, T2, T4, T5/T6).
- **why_not_enforced:** We cannot synthesize non-canonical governance text. The resolver is strictly programmed to hard-fail (throw an Error) if T3 is requested.
- **risk_if_unaddressed:** If a real complaint results in a T3 state, the pipeline will crash and fail to generate a required determination output.
- **temporary_controls:** The `resolveTemplate` function intentionally throws `'Missing canonical determination template for T3_DESKTOP_MOBILE_CONSTRAINED. AFIntakeTemplate.pdf provides no approved text for this state. Refusing to synthesize non-canonical determination content.'`
- **tests_missing_or_partial:** End-to-end integration tests for T3 generation are impossible.
- **fixtures_missing_or_partial:** Fixture D.3 (T3 expected output) is missing and cannot be created.
- **expected_failure_mode:** Hard crash at template resolution phase during `DETERMINATION.txt` compilation.
- **blocks_completion:** true
- **planned_followup:** Await issuance of canonical text for T3 in a revised `AFIntakeTemplate.pdf`, or receive doctrine waiver allowing fall-back to T2 with a specific note.