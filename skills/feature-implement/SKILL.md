---
name: feature-implement
description: Execute code implementation. First code change requires human confirmation. Generates diff summary before completion. HIGH-RISK: requires human confirmation gate.
---

# Feature Implement — Code Implementation

Execute code changes based on the implementation plan. HIGH-RISK skill with mandatory human confirmation before first code change.

## Integration Contract
- **Entry:** `/scc-dev-sphere:feature-implement`
- **Inputs:** Implementation plan, repo binding, design artifacts
- **Outputs:** Code changes, `implementation/implementation-log.md`, diff summary
- **Completion criteria:** Code changes complete, diff summary generated, status → verification_ready

## Precondition Check
Verify `state.status` is `implementation_planned` or `implementing`. STOP if not.

## First Code Change Gate (MANDATORY)
If first code change: display implementation summary (repos, scope, verification, risks), wait for explicit human "YES", record in implementation log, update status to `implementing`.

## Implementation
1. Execute changes following plan.
2. Run tests.
3. Fix issues.
4. Flag scope deviations (don't auto-revert, just flag).

## Before Declaring Complete
Generate diff summary. If significant deviations, present to user. Update `status = 'verification_ready'`.
