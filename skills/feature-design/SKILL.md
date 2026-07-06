---
name: feature-design
description: Design orchestration entry. Reads state.json and advances only the next allowed design phase. Does NOT overwrite human-approved stages unless --mode revise is used.
---

# Feature Design — Design Orchestrator

Orchestrate the design phase progression. This skill reads the current state and advances exactly ONE design phase — the next unstarted or incomplete phase in order.

## Integration Contract

- **Entry:** `/scc-dev-sphere:feature-design [--mode revise]`
- **Inputs:** Current state.json
- **Outputs:** Progresses the next design phase (business → solution → implementation → test → integrated)
- **Completion criteria:** Next phase design artifact generated or revised

## Execution

1. Read `state.json` to determine which phases are ready and which is next.
2. Delegate to the appropriate phase skill based on the `feature-workflow.js` resolver output.
3. For `--mode revise`: use the specified phase skill's revise mode.
4. After completion, suggest: "Use `/scc-dev-sphere:workflow` to check for review needs."

## Key Rules

- NEVER overwrite a `human_approved` stage without `--mode revise`.
- Each call advances exactly ONE phase.
- After all 4 phases reach `ai_review_passed` (or `human_approved` per mode), generate/refresh `integrated-design.md`.
