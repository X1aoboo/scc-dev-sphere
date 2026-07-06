---
name: workflow
description: Main workflow entry for scc-dev-sphere. Reads current task, computes next action, and guides agent/skill execution. Use to advance any active task.
---

# Workflow -- Main Orchestrator Entry

You are the main workflow entry point for the scc-dev-sphere plugin. Your job is to read the current task state, compute the next legitimate action via the deterministic workflow resolver, and guide the user to execute it.

## Integration Contract

- **Entry:** `/scc-dev-sphere:workflow [list|switch <task-id>]`
- **Inputs:** Optional sub-action via `$ARGUMENTS`
- **Outputs:** nextAction displayed to user
- **Completion criteria:** nextAction computed and presented

## Execution Steps

### Step 1: Parse Arguments

Check `$ARGUMENTS`:
- `list` -> List all tasks in `.devsphere/tasks/` and show their status
- `switch <task-id>` -> Update `current-task.json` to point to the specified task
- (empty) -> Compute next action for the current active task

### Step 2: Handle `list` Sub-Action

If `$ARGUMENTS` starts with `list`:

```bash
node scripts/devsphere-state.js list-tasks
```

If the above command does not support `list-tasks`, list tasks manually by:
1. Reading all subdirectories of `.devsphere/tasks/`
2. For each task directory, reading its `state.json`
3. Displaying the task ID, status, and stage for each

Format the output as a table or bulleted list showing task-id, status, and current stage.

Stop here after displaying.

### Step 3: Handle `switch` Sub-Action

If `$ARGUMENTS` starts with `switch`:

Extract the `<task-id>` from `$ARGUMENTS`. The task-id is the second word after `switch`.

Verify the task exists by checking that `.devsphere/tasks/<task-id>/state.json` exists. If it does not exist, display an error listing available tasks.

To switch, update `.devsphere/current-task.json`:

```bash
node scripts/devsphere-state.js switch <task-id>
```

If the above command does not support `switch`, write `.devsphere/current-task.json` manually with:
```json
{
  "activeTaskId": "<task-id>",
  "activeTaskType": "feature",
  "taskPath": ".devsphere/tasks/<task-id>"
}
```

After switching, display:
```
Switched to task: <task-id>
Run /scc-dev-sphere:workflow to see the next action.
```

Stop here after switching.

### Step 4: If No Active Task

If `.devsphere/current-task.json` does not exist or has no `activeTaskId` (check with `node scripts/devsphere-state.js read-current-task` or by reading the file directly), display:

```
No active task found. To create a feature task, use:
  /scc-dev-sphere:feature-init

To list existing tasks: /scc-dev-sphere:workflow list
To switch tasks: /scc-dev-sphere:workflow switch <task-id>
```

Stop here.

### Step 5: Compute nextAction

Run the deterministic workflow resolver:

```bash
node scripts/devsphere-workflow.js .
```

The resolver will:
1. Read `.devsphere/current-task.json`
2. Identify `taskType`
3. Load the appropriate resolver (MVP: `scripts/workflows/feature-workflow.js`)
4. Output a `nextAction` JSON object to stdout

Parse the JSON output from stdout.

### Step 6: Present nextAction to User

Based on `nextAction.kind`:

#### `run_skill`

Display:
```
Next Action: {nextAction.reason}

Task: {nextAction.taskId}
Status: {nextAction.status}
Stage: {nextAction.stage || 'N/A'}
Target: {nextAction.target || 'N/A'}

Recommended Action:
  Skill: /scc-dev-sphere:{nextAction.skill}
  Agent(s): {nextAction.agents.join(', ')}

Required Artifacts:
{nextAction.requiredArtifacts.map(a => '  - ' + a).join('\n')}

Expected Outputs:
{nextAction.expectedArtifacts.map(a => '  - ' + a).join('\n')}
```

Then guide the user to execute the recommended skill. For example:
- If `skill=feature-design-business` and `agents=[sa]`: Invoke the SA agent and instruct it to execute the `feature-design-business` skill.
- If `skill=feature-review` and `agents=[se]`: Invoke the SE agent with the `feature-review` skill and `--target` argument from `nextAction.args.target`.

Use the Agent tool to invoke the recommended agent, passing the skill name and arguments as context.

**IMPORTANT:** The workflow itself does NOT generate designs, run reviews, or modify state. It ONLY tells the user what to do next.

#### `human_confirm`

Display:
```
Human Confirmation Required

Task: {nextAction.taskId}
Stage: {nextAction.stage}
{pause.prompt if nextAction.pause}

Please respond to proceed.
```

Wait for the user's response before continuing.

#### `show_status`

Display the status information from `nextAction.reason`. Suggest checking `/scc-dev-sphere:status` for full details.

#### `blocked`

Display:
```
Blocked

{nextAction.reason}

To view full status: /scc-dev-sphere:status
```

#### `completed`

Display:
```
Task Complete

{nextAction.reason}

To view full status: /scc-dev-sphere:status
```

### Step 7: After User Acts

After the user executes the recommended agent/skill, the corresponding skill will produce artifacts and update state. The next time `/scc-dev-sphere:workflow` is called, the resolver will compute the new next action based on updated state.

## Constraints

- Workflow does NOT execute agent/skill actions directly -- it only recommends.
- Workflow does NOT modify state files -- that is the responsibility of skills and hooks.
- Workflow always re-computes nextAction from current persistent state (no caching between calls).
