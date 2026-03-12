# Intake Test Inventory (Appendix E)

| Test Suite | Purpose | Execution | Status |
|---|---|---|---|
| `template_resolution.test.js` | Proves canonical templates resolve properly from enums, fail properly on null/undefined, and inject parameters safely. | Unit Test | PASS |
| `template_resolution.test.js` (T3) | Proves `T3_DESKTOP_MOBILE_CONSTRAINED` throws required doctrine gap error. | Unit Test | PASS |
| End-to-End Orchestrator Generation | Proves `DETERMINATION.txt` is successfully written during actual Playwright flows. | E2E | **MISSING** |