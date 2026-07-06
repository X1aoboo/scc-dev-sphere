---
name: feature-assess
description: Assess requirement complexity and risk, recommend workflow mode. Does NOT pre-load knowledge context — only identifies what needs investigation.
---

# Feature Assess — Complexity & Risk Assessment

Analyze the requirement input to determine complexity, identify risk factors, and recommend a workflow mode (`auto-design`, `collaborative-design`, or `strict-human-loop`).

## Integration Contract

- **Entry:** `/scc-dev-sphere:feature-assess`
- **Inputs:** Requirement description from `inputs/requirement.md`, current state
- **Outputs:** Assessment written to state, workflow mode confirmed by user
- **Completion criteria:** `workflowMode` confirmed in `state.json`, status advanced to `assessed`

## Execution Steps

### Step 1: Read Input

Read the requirement from `inputs/requirement.md` in the active task workspace. Read current `state.json`.

### Step 2: Run Risk Assessment

Evaluate the requirement against hard risk triggers:

1. **Cross-system or cross-module impact?** — Does this change span multiple systems or modules?
2. **Data migration or model change?** — Are there schema changes, data migrations?
3. **Permission, security, or audit changes?** — Are auth, permissions, or audit trails affected?
4. **External interface or compatibility changes?** — Are APIs, contracts, or protocols changing?
5. **Performance, capacity, or stability impact?** — Are there SLAs, throughput, or reliability concerns?
6. **Core business path?** — Does this touch the critical revenue or user path?
7. **Irreversible operations?** — Are there destructive or non-rollback-able changes?
8. **Deployment, config, or environment impact?** — Does this change how things are deployed or configured?
9. **Requirement incomplete or ambiguous?** — Are there significant gaps in the requirement?

### Step 3: Recommend Mode

- **0-1 risk triggers:** Recommend `auto-design`
- **2-3 risk triggers:** Recommend `collaborative-design`
- **4+ risk triggers:** Default recommend `strict-human-loop`

### Step 4: Present Assessment & Get Confirmation

Display the assessment:

```
## Complexity & Risk Assessment

**Requirement:** {summary}

**Risk Triggers Hit:**
{list each trigger with explanation}

**Recommended Mode:** {recommended mode}
- auto-design: AI auto-advances design phases, human approves before code
- collaborative-design: Selective human gates for complex phases
- strict-human-loop: Human confirms every phase

**CI/CD & Environment Risk:** {yes/no — if yes, CIE will be triggered during review}

Which workflow mode would you like to use?
```

### Step 5: Handle Mode Selection

Wait for user to confirm or change the mode.

If `collaborative-design` is chosen, ask:
"Which design phases need human gate confirmation? Options: businessDesign, solutionDesign, implementationDesign, testDesign. Enter comma-separated list or 'none'."

If a high-risk task is downgraded (e.g., from `strict-human-loop` to `auto-design`), record the decision:
- Write to `decisions/business-design-decisions.md`:
  ```markdown
  ## D-001 Workflow Mode Downgrade
  - **Original Recommendation:** strict-human-loop
  - **Selected Mode:** {selected}
  - **Reason:** {user's reason}
  - **Accepted Risks:** {list of risk triggers being accepted}
  - **Decision Time:** {timestamp}
  - **Status:** accepted
  ```

### Step 6: Update State

Update `state.json`:
- Set `workflowMode` to the confirmed mode
- Set `humanGateStages` to the confirmed stages (empty array if none)
- Set `status` to `assessed`

### Step 7: Complete

Display confirmation and suggest `/scc-dev-sphere:workflow` for the next step.
