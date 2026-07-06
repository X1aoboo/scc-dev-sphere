---
name: feature-approve
description: Execute final design approval. Validates design_ready preconditions, generates design-final-approval.json, advances status to approved_for_implementation. HIGH-RISK: requires human confirmation gate.
---

# Feature Approve — Final Design Approval

Generate the final design approval. HIGH-RISK skill with mandatory human confirmation gate.

## Integration Contract
- **Entry:** `/scc-dev-sphere:feature-approve`
- **Inputs:** State at `design_ready`, all design artifacts, review matrix
- **Outputs:** `approvals/design-final-approval.json`, `status = approved_for_implementation`
- **Completion criteria:** Approval record written, status updated

## Precondition Checks (HARD GATE)
1. `state.status === 'design_ready'`
2. All blocking issues closed
3. All advisory items have human confirmation
4. All accepted_risk in decisions
5. integrated-design.md includes risk summary

## Human Confirmation Gate (MANDATORY)
Display approval summary with all artifacts and their hashes, accepted risks, scope, and limitations. Wait for explicit human "YES".

## After Approval
Generate `approvals/design-final-approval.json`, update `status = 'approved_for_implementation'`.
