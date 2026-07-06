---
name: feature-verify
description: Run local verification and generate test handoff package. Only skill that can set status=completed. Consumes verification_ready gate.
---

# Feature Verify — Verification & Test Handoff

Run local verification and produce the test handoff package. Final step before task completion.

## Integration Contract
- **Entry:** `/scc-dev-sphere:feature-verify`
- **Inputs:** Code changes, implementation log, test design
- **Outputs:** `verification/test-handoff.md`, status update
- **Completion criteria:** Test handoff package generated

## Precondition
Verify `state.status === 'verification_ready'`.

## Execution
1. Run local verification (tests, linting, build).
2. Compile results (passed, failed, untested).
3. Generate test-handoff.md with: verification results, commands, untested items, change summary, impact scope, regression suggestions, known risks, environment prep, CI/CD guidance.

## Result Handling
- All pass: `status = 'completed'`
- Failures fixable: `status = 'implementing'`
- Unrecoverable: `status = 'blocked'`

## Completion
Display completion summary.
