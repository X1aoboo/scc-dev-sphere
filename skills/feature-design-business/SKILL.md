---
name: feature-design-business
description: Business requirement design phase. SA agent analyzes requirements, defines business rules, scope, terminology, and exception flows. Query knowledge base for existing business context.
---

# Feature Design — Business Design

Execute the business design phase. The SA agent analyzes requirements and produces `artifacts/business-design.md`.

## Integration Contract

- **Entry:** `/scc-dev-sphere:feature-design-business [--mode revise]`
- **Inputs:** Requirement from `inputs/requirement.md`, knowledge base queries
- **Outputs:** `artifacts/business-design.md`, evidence snapshots in `evidence/knowledge/`
- **Completion criteria:** `business-design.md` written with all template sections filled, stage status updated to `drafted`

## Execution

1. Load the SA agent.
2. Read `inputs/requirement.md` and the business design template from `templates/artifacts/business-design.md`.
3. Query knowledge base using `knowledge-query` skill for:
   - Existing business rules for the affected domain
   - Historical requirement designs
   - Current system behavior documentation
4. Generate `artifacts/business-design.md` following the template.
5. Save all knowledge results actually used as evidence in `evidence/knowledge/EV-xxx-*.md`.
6. Update `evidence/evidence-registry.json` with new entries.
7. Mark unverified premises as `assumption` in the design document.
8. Update `state.json` → `stages.businessDesign.status = 'drafted'`.

## Revise Mode (`--mode revise`)

If `businessDesign` is `human_approved`, revision requires:
1. Record revision reason in `decisions/business-design-decisions.md`.
2. Document impact on downstream phases (solutionDesign, implementationDesign, testDesign).
3. After revision, reset downstream phase statuses to `drafted` if affected.
4. Flag that re-review is required.

## Constraints

- Only modify `artifacts/business-design.md` and `decisions/business-design-decisions.md`.
- Do NOT modify other phase artifacts.
- Every factual claim about existing business behavior MUST cite an evidence ID.
