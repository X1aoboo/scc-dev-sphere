---
name: feature-design-test
description: Test design phase. TSE agent produces test-design.md with test strategy, cases, data, environments, and regression scope. Queries test standards, historical defects, and regression scope.
---

# Feature Design — Test Design

Execute the test design phase. The TSE agent produces `artifacts/test-design.md` with test strategy, cases, data, environments, and regression scope.

## Integration Contract

- **Entry:** `/scc-dev-sphere:feature-design-test [--mode revise]`
- **Inputs:** All upstream design artifacts, test knowledge base
- **Outputs:** `artifacts/test-design.md`, evidence snapshots in `evidence/knowledge/`
- **Completion criteria:** `test-design.md` written with all template sections filled, stage status updated to `drafted`

## Execution

1. Load the TSE agent.
2. Read upstream design artifacts (business, solution, implementation) and the test design template from `templates/artifacts/test-design.md`.
3. Query knowledge base using `knowledge-query` skill for:
   - Existing test standards and conventions
   - Historical defect patterns and high-risk areas
   - Regression test scope and coverage gaps
   - Test environments and data requirements
4. Generate `artifacts/test-design.md` following the template.
5. Save all knowledge results actually used as evidence in `evidence/knowledge/EV-xxx-*.md`.
6. Update `evidence/evidence-registry.json` with new entries.
7. Mark unverified assumptions explicitly in the design document.
8. Update `state.json` → `stages.testDesign.status = 'drafted'`.

## Revise Mode (`--mode revise`)

If `testDesign` is `human_approved`, revision requires:
1. Record revision reason in `decisions/test-design-decisions.md`.
2. Document impact on verification and test execution phases.
3. After revision, flag that re-review is required.
4. Note that testDesign is the final design phase; no downstream design phases to reset.

## Constraints

- Only modify `artifacts/test-design.md` and `decisions/test-design-decisions.md`.
- Do NOT modify other phase artifacts.
- Every test strategy claim about existing test coverage MUST cite an evidence ID.
