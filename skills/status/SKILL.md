---
name: status
description: Display current task status, phase progress, pending confirmations, blocking items, risks, and next action suggestion. Read-only — does not modify state.
---

# Status — Read-Only Status Display

Display a comprehensive status summary of the current active task. This skill is READ-ONLY — it never modifies files, advances state, or writes decisions.

## Integration Contract

- **Entry:** `/scc-dev-sphere:status`
- **Inputs:** None
- **Outputs:** Status summary displayed to user
- **Completion criteria:** Status displayed

## Execution Steps

### Step 1: Read Current Task

Read `.devsphere/current-task.json` from the workspace root. If no active task, display "No active task" and stop.

### Step 2: Read State

Read `state.json` from the task path specified in current-task.json.

### Step 3: Read Review Matrix

Read `reviews/review-matrix.json` from the task path.

### Step 4: Compute nextAction (Read-Only)

Run `scripts/devsphere-workflow.js` to get the next action suggestion. This is for display only — do NOT act on it.

### Step 5: Display Status Summary

For `taskType=feature`, display:

```
#  Task Status: {taskId}

**Type:** feature
**Workflow Mode:** {workflowMode}
**Overall Status:** {status}

## Design Phases
| Phase | Status | Artifact |
|-------|--------|----------|
| Business Design | {businessDesign.status} | {businessDesign.artifact} |
| Solution Design | {solutionDesign.status} | {solutionDesign.artifact} |
| Implementation Design | {implementationDesign.status} | {implementationDesign.artifact} |
| Test Design | {testDesign.status} | {testDesign.artifact} |
| Integrated Design | {present/not present} | artifacts/integrated-design.md |

## Review Status
- Blocking Issues: {total blocking count}
- Advisory Items Pending: {total advisory count} ({confirmed}/{total} confirmed)
- Risk Candidates: {count}

## Pending Human Actions
{list of items requiring human confirmation}

## Approvals
- Design Final Approval: {present/not present}
- Implementation Plan Approval: {present/not present}

## Repo Binding
{list bound repos or "Not yet bound"}

## Next Step
{nextAction.reason}
```

For other taskType values, display: "Task type '{taskType}' status display is not yet implemented in MVP."

### Step 6: Conclude

After displaying status, suggest: "Use `/scc-dev-sphere:workflow` to advance to the next step."
