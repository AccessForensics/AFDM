# Intake Test Inventory (Appendix E)

| Test Suite | Purpose | Execution Type | Status |
|---|---|---|---|
| `tests/template_resolution.test.js` | Proves canonical templates resolve properly from enums, fail properly on null/undefined, and inject parameters safely. | Unit | PASS |
| `tests/template_resolution.test.js` (T3) | Proves `T3_DESKTOP_MOBILE_CONSTRAINED` throws required doctrine gap error. | Unit | PASS |
| Orchestrator E2E | Proves the resolver is invoked and writes `DETERMINATION.txt` to output payload. | E2E | MISSING |