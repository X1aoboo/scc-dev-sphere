---
name: feature-plan-implementation
description: Generate implementation plan after design approval. DEV agent produces implementation-plan.md with repo binding, file changes, step sequence, test commands, and risk controls.
---

# Feature Plan Implementation — Generate Implementation Plan

Generate the development execution plan bridging design and code implementation.

## Integration Contract
- **Entry:** `/scc-dev-sphere:feature-plan-implementation`
- **Inputs:** Approved design artifacts, code repository access
- **Outputs:** `implementation/implementation-plan.md`, repo binding in `links/repos.json`
- **Completion criteria:** Implementation plan generated, status advanced

## Execution
1. Load DEV agent.
2. Bind repos if not yet bound.
3. Query code repositories for structure/patterns.
4. Generate plan including repos, module/file changes, step sequence, test commands, rollback, risk controls, CIE needs.
5. Save repository evidence.

## Human Confirmation (High-Risk/Strict)
If strict-human-loop or high risk: present plan, wait for confirmation, generate `implementation-plan-approval.json`.

## State Update
- Normal: `status = 'implementation_planned'`
- High-risk/strict: only after approval record
