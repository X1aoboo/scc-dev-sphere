---
name: feature-review
description: Execute AI cross-review and revision loop for a design artifact. Supports stage review (single artifact) and integrated review (cross-phase consistency). Outputs blocking/advisory/risk_candidate issues.
---

# Feature Review — AI Cross-Review & Revision Loop

Execute formal AI review on a design artifact. This skill implements the review-revision closed loop: review → identify issues → return blocking to design agent → re-review → repeat until blocking=0.

## Integration Contract

- **Entry:** `/scc-dev-sphere:feature-review --target <artifact>`
- **Inputs:** Target artifact path, review-matrix.json, base review matrix from spec
- **Outputs:** Review files in `reviews/<target>/`, updated `review-matrix.json`
- **Completion criteria:** All blocking closed OR max 3 rounds reached

## Parameters

- `--target`: One of `business-design`, `solution-design`, `implementation-design`, `test-design`, `integrated-design`

## Execution

### Step 1: Determine Reviewers
Look up the base review matrix for the target artifact (spec section 9). Check if risk-enhanced reviewers are needed.

### Step 2: Run Parallel Reviews
For each required reviewer agent, load the agent with the `feature-review` skill context and the target artifact. Each agent reviews from their perspective and outputs blocking issues, advisory items, and risk candidates.

### Step 3: Compile Review Results
Aggregate all review findings into `reviews/<target>/<agent>-review.md` files and update `review-matrix.json`.

### Step 4: Revision Loop
If blocking > 0: return issues to design agent → revise → re-verify → repeat until blocking=0 or max 3 rounds.

### Step 5: Advisory Compilation
When blocking=0: compile advisory checklist, write `reviews/advisory-confirmation.json`, present to user for human decision.

### Step 6: Update State
If blocking=0: update `stages.<phase>.status = 'ai_review_passed'`.

## Exit Conditions
- All blocking closed → success
- Max 3 revision rounds → flag unresolved
- Irresolvable conflicts → flag for human
- Human info needed → pause
