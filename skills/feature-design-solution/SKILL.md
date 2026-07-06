---
name: feature-design-solution
description: Solution design phase. SE agent produces solution-design.md defining architecture, component interaction, interfaces, data flow, and technology choices. Queries architecture specs and interface contracts.
---

# Feature Design — Solution Design

Execute the solution design phase. The SE agent produces `artifacts/solution-design.md` defining architecture, component interaction, interfaces, data flow, and technology choices.

## Integration Contract

- **Entry:** `/scc-dev-sphere:feature-design-solution [--mode revise]`
- **Inputs:** Business design from `artifacts/business-design.md`, architecture knowledge
- **Outputs:** `artifacts/solution-design.md`, evidence snapshots in `evidence/knowledge/`
- **Completion criteria:** `solution-design.md` written with all template sections filled, stage status updated to `drafted`

## Execution

1. Load the SE agent.
2. Read `artifacts/business-design.md` and the solution design template from `templates/artifacts/solution-design.md`.
3. Query knowledge base using `knowledge-query` skill for:
   - Existing architecture specifications
   - Interface contracts and API documentation
   - Compatibility constraints and dependencies
   - Non-functional requirements and SLAs
4. Generate `artifacts/solution-design.md` following the template.
5. Save all knowledge results actually used as evidence in `evidence/knowledge/EV-xxx-*.md`.
6. Update `evidence/evidence-registry.json` with new entries.
7. Mark unverified assumptions explicitly in the design document.
8. Update `state.json` → `stages.solutionDesign.status = 'drafted'`.

## Revise Mode (`--mode revise`)

If `solutionDesign` is `human_approved`, revision requires:
1. Record revision reason in `decisions/solution-design-decisions.md`.
2. Document impact on downstream phases (implementationDesign, testDesign).
3. After revision, reset downstream phase statuses to `drafted` if affected.
4. Flag that re-review is required.

## Constraints

- Only modify `artifacts/solution-design.md` and `decisions/solution-design-decisions.md`.
- Do NOT modify other phase artifacts.
- Every architectural decision MUST cite an evidence ID or be marked as an assumption.
