---
name: feature-design-implementation
description: Implementation design phase. MDE agent produces implementation-design.md with module structure, call chains, code patterns, and technical details. Queries code repositories for existing implementation context.
---

# Feature Design — Implementation Design

Execute the implementation design phase. The MDE agent produces `artifacts/implementation-design.md` with module structure, call chains, code patterns, and technical details.

## Integration Contract

- **Entry:** `/scc-dev-sphere:feature-design-implementation [--mode revise]`
- **Inputs:** Solution design from `artifacts/solution-design.md`, code repository access
- **Outputs:** `artifacts/implementation-design.md`, evidence snapshots in `evidence/knowledge/`
- **Completion criteria:** `implementation-design.md` written with all template sections filled, stage status updated to `drafted`

## Execution

1. Load the MDE agent.
2. Read `artifacts/solution-design.md` and the implementation design template from `templates/artifacts/implementation-design.md`.
3. Query code repositories using `knowledge-query` skill for:
   - Existing module structure and organization
   - Relevant call chains and data flow paths
   - Code patterns and conventions in use
   - Existing interfaces and extension points
4. Generate `artifacts/implementation-design.md` following the template.
5. Save all code query results actually used as evidence in `evidence/knowledge/EV-xxx-*.md`.
6. Update `evidence/evidence-registry.json` with new entries.
7. Mark unverified assumptions explicitly in the design document.
8. Update `state.json` → `stages.implementationDesign.status = 'drafted'`.

## Revise Mode (`--mode revise`)

If `implementationDesign` is `human_approved`, revision requires:
1. Record revision reason in `decisions/implementation-design-decisions.md`.
2. Document impact on downstream phases (testDesign).
3. After revision, reset downstream phase statuses to `drafted` if affected.
4. Flag that re-review is required.

## Constraints

- Only modify `artifacts/implementation-design.md` and `decisions/implementation-design-decisions.md`.
- Do NOT modify other phase artifacts.
- Every code-level claim about existing behavior MUST cite an evidence ID.
