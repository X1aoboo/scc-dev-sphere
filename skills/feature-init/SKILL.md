---
name: feature-init
description: Create a new feature development task workspace. Initializes .devsphere task directory, state.json, and current-task.json.
---

# Feature Init — Create Feature Task

Create a new feature development task workspace under `.devsphere/tasks/feature/<task-id>/`. Both new requirements and existing functionality adjustments are treated as feature tasks.

## Integration Contract

- **Entry:** `/scc-dev-sphere:feature-init`
- **Inputs:** Task ID (optional, auto-generated as `FEAT-YYYYMMDD-NNN`), requirement description (from user)
- **Outputs:** Task workspace with `state.json` (status=initialized), `current-task.json` updated
- **Completion criteria:** `state.json` exists with status=initialized, directories created

## Execution Steps

### Step 1: Gather Input

Ask the user for:
1. A brief description of the requirement (1-3 sentences)
2. Optionally, a specific task ID (otherwise auto-generate as `FEAT-YYYYMMDD-NNN`)

Save the requirement description to `inputs/requirement.md`.

### Step 2: Create Task Workspace

Run:
```bash
node scripts/devsphere-workspace.js create-feature-task "<workspace-root>" "<task-id>" auto-design
```

This creates the `.devsphere/tasks/feature/<task-id>/` directory with all subdirectories and initializes `state.json` with `status=initialized`, `workflowMode=auto-design`.

### Step 3: Create Initial Files

- Write `inputs/requirement.md` with the user's requirement description.
- Initialize `reviews/review-matrix.json`:
  ```bash
  node scripts/devsphere-review-matrix.js init "<task-path>"
  ```
- Initialize `evidence/evidence-registry.json` as `{"evidence": []}`.

### Step 4: Confirm Creation

Display:
```
✅ Feature task created: {taskId}

**Workspace:** .devsphere/tasks/feature/{taskId}/
**Status:** initialized
**Workflow Mode:** auto-design (can be changed during assessment)

**Next Step:** /scc-dev-sphere:workflow
  → Will guide you through complexity assessment.
```

### Step 5: Suggest Next Action

"Use `/scc-dev-sphere:workflow` to proceed with complexity and risk assessment."
