# scc-dev-sphere MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Code plugin that implements auditable, human-in-the-loop feature development workflows from design through code delivery.

**Architecture:** The plugin composes Claude Code native components — `skills/` (17 work units), `agents/` (6 role contexts), `hooks/` (guard gates + state sync), and `scripts/` (deterministic state/resolver logic). Skills produce artifacts; the workflow resolver computes `nextAction` from persisted state; hooks enforce hard gates. No self-built agent runtime.

**Tech Stack:** Claude Code plugin format (skills as SKILL.md with YAML frontmatter, agents as .md with YAML frontmatter, hooks.json, plugin.json). Scripts in Node.js (CommonJS). State in JSON files under `.devsphere/`.

## Global Constraints

- MVP uses ONLY `skills/` for slash-callable entry points — no `commands/` directory.
- Agent names use lowercase kebab-case in YAML frontmatter (`sa`, `se`, `mde`, `dev`, `tse`, `cie`).
- Agent definitions do NOT depend on `hooks`, `mcpServers`, or `permissionMode` frontmatter fields.
- Script paths in hooks MUST use `${CLAUDE_PLUGIN_ROOT}` variable.
- Plugin `hooks/hooks.json` is auto-loaded; do NOT reference it in `plugin.json`.
- Workflow MUST adopt "artifact + state driven" model: skills produce artifacts, resolver computes nextAction, hooks sync state.
- `nextAction` schema: `{kind, taskType, taskId, status, stage, target, skill, args, agents[], reason, requiredArtifacts[], expectedArtifacts[], pause}`.
- Stage states: `not_started → drafted → ai_review_passed → human_approved`. No transient states.
- Task states: `initialized → assessed → designing → design_ready → approved_for_implementation → implementation_planned → implementing → verification_ready → completed`.
- Only `implementation_planned` and `implementing` allow code modification.
- High-risk skills (approve, implement, revise approved artifacts) MUST have built-in human confirmation gates.
- Code modification scope is NOT hard-blocked; deviations are flagged post-implementation.
- Decision records: semantic (skills/agents) + bookkeeping (hooks/scripts) separation.

---

## File Structure Map

```
scc-dev-sphere/
├── .claude-plugin/plugin.json          # Manifest (Task 1)
├── .mcp.json                           # MCP stub (Task 1)
├── scripts/                            # Deterministic logic (Tasks 2-8)
│   ├── devsphere-state.js              # State I/O
│   ├── devsphere-workspace.js          # Workspace creation
│   ├── devsphere-review-matrix.js      # Review matrix I/O
│   ├── devsphere-approval.js           # Approval I/O + validation
│   ├── devsphere-guard.js              # Hook guard checks
│   ├── devsphere-workflow.js           # Workflow router
│   └── workflows/
│       └── feature-workflow.js         # Feature nextAction resolver
├── agents/                             # Role contexts (Tasks 9-14)
│   ├── sa.md
│   ├── se.md
│   ├── mde.md
│   ├── dev.md
│   ├── tse.md
│   └── cie.md
├── hooks/hooks.json                    # Hook config (Task 15)
├── templates/                          # Artifact templates (Task 16)
│   ├── artifacts/
│   │   ├── business-design.md
│   │   ├── solution-design.md
│   │   ├── implementation-design.md
│   │   ├── test-design.md
│   │   └── integrated-design.md
│   ├── reviews/
│   │   └── review-template.md
│   ├── approvals/
│   │   └── approval-template.json
│   └── verification/
│       └── test-handoff-template.md
└── skills/                             # Work units (Tasks 17-33)
    ├── workflow/SKILL.md               # Main orchestrator entry
    ├── status/SKILL.md                 # Read-only status display
    ├── feature-init/SKILL.md
    ├── feature-assess/SKILL.md
    ├── feature-design/SKILL.md
    ├── feature-design-business/SKILL.md
    ├── feature-design-solution/SKILL.md
    ├── feature-design-implementation/SKILL.md
    ├── feature-design-test/SKILL.md
    ├── feature-review/SKILL.md
    ├── feature-approve/SKILL.md
    ├── feature-plan-implementation/SKILL.md
    ├── feature-implement/SKILL.md
    ├── feature-verify/SKILL.md
    ├── knowledge-query/SKILL.md
    ├── backend-development/SKILL.md
    ├── frontend-development/SKILL.md
    └── fullstack-change-planning/SKILL.md
```

---

## Phase 1: Plugin Scaffold

### Task 1: Plugin Manifest & Directory Structure

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.mcp.json`
- Create all empty directories as listed in File Structure Map

**Interfaces:**
- Produces: Plugin installable via `/plugin marketplace add`

- [ ] **Step 1: Create all directories**

```bash
cd /Users/xiaobo/Documents/Projects/scc-dev-sphere
mkdir -p .claude-plugin
mkdir -p skills/{workflow,status,feature-init,feature-assess,feature-design,feature-design-business,feature-design-solution,feature-design-implementation,feature-design-test,feature-review,feature-approve,feature-plan-implementation,feature-implement,feature-verify,knowledge-query,backend-development,frontend-development,fullstack-change-planning}
mkdir -p agents
mkdir -p hooks
mkdir -p scripts/workflows
mkdir -p templates/{artifacts,reviews,approvals,verification}
```

- [ ] **Step 2: Write plugin.json**

```json
{
  "name": "scc-dev-sphere",
  "version": "0.1.0",
  "description": "需求开发流程插件 — 从设计到代码落地的可审计 AI 辅助工作流。支持 SA/SE/MDE/DEV/TSE/CIE 多角色协作，内置 AI 交叉评审闭环和 Human-in-loop 批准机制。",
  "author": {
    "name": "scc-dev-sphere"
  },
  "license": "MIT",
  "keywords": ["requirements", "design", "code-review", "workflow", "development"]
}
```

- [ ] **Step 3: Write .mcp.json (stub)**

```json
{
  "mcpServers": {}
}
```

- [ ] **Step 4: Verify directory structure**

```bash
find . -type d | sort
```
Expected: All directories from File Structure Map exist.

- [ ] **Step 5: Commit**

```bash
git add .claude-plugin .mcp.json skills agents hooks scripts templates
git commit -m "feat: scaffold plugin directory structure and manifest"
```

---

## Phase 2: Scripts — Deterministic Logic Foundation

### Task 2: devsphere-state.js — State I/O Module

**Files:**
- Create: `scripts/devsphere-state.js`

**Interfaces:**
- Produces:
  - `readJSON(filePath)` → object|null
  - `writeJSON(filePath, data)` → void
  - `readState(taskPath)` → state object
  - `writeState(taskPath, state)` → void
  - `readCurrentTask(workspaceRoot)` → current task object
  - `writeCurrentTask(workspaceRoot, task)` → void
  - `updateStageStatus(taskPath, stageName, newStatus)` → void
  - `updateTaskStatus(taskPath, newStatus)` → void
  - `getTaskPath(workspaceRoot)` → string|null (derived from current-task.json)

- [ ] **Step 1: Write scripts/devsphere-state.js**

```javascript
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// --- Core I/O ---

function readJSON(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

function writeJSON(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// --- State ---

function readState(taskPath) {
  return readJSON(path.join(taskPath, 'state.json'));
}

function writeState(taskPath, state) {
  writeJSON(path.join(taskPath, 'state.json'), state);
}

function readCurrentTask(workspaceRoot) {
  const devsphereDir = path.join(workspaceRoot, '.devsphere');
  return readJSON(path.join(devsphereDir, 'current-task.json'));
}

function writeCurrentTask(workspaceRoot, task) {
  const devsphereDir = path.join(workspaceRoot, '.devsphere');
  writeJSON(path.join(devsphereDir, 'current-task.json'), task);
}

function getTaskPath(workspaceRoot) {
  const current = readCurrentTask(workspaceRoot);
  if (!current || !current.taskPath) return null;
  return path.join(workspaceRoot, current.taskPath);
}

// --- State Updates ---

function updateStageStatus(taskPath, stageName, newStatus) {
  const state = readState(taskPath);
  if (!state || !state.stages || !state.stages[stageName]) {
    throw new Error(`Stage ${stageName} not found in state`);
  }
  state.stages[stageName].status = newStatus;
  // If artifact path is expected but not set, set it
  if (!state.stages[stageName].artifact) {
    state.stages[stageName].artifact = `artifacts/${stageName.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')}.md`;
  }
  writeState(taskPath, state);
}

function updateTaskStatus(taskPath, newStatus) {
  const state = readState(taskPath);
  if (!state) throw new Error(`State not found at ${taskPath}`);
  state.status = newStatus;
  writeState(taskPath, state);
}

// --- CLI entry (for hook invocation) ---

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'read-state': {
        const taskPath = args[1];
        const state = readState(taskPath);
        process.stdout.write(JSON.stringify(state));
        break;
      }
      case 'read-current-task': {
        const workspaceRoot = args[1];
        const task = readCurrentTask(workspaceRoot);
        process.stdout.write(JSON.stringify(task));
        break;
      }
      case 'get-task-path': {
        const workspaceRoot = args[1];
        const taskPath = getTaskPath(workspaceRoot);
        process.stdout.write(JSON.stringify({ taskPath }));
        break;
      }
      default:
        process.stderr.write(`Unknown command: ${command}\n`);
        process.exit(1);
    }
  } catch (e) {
    process.stderr.write(`Error: ${e.message}\n`);
    process.exit(1);
  }
}

// Run CLI if executed directly
if (require.main === module) {
  main();
}

// Module exports for use by other scripts
module.exports = {
  readJSON,
  writeJSON,
  readState,
  writeState,
  readCurrentTask,
  writeCurrentTask,
  getTaskPath,
  updateStageStatus,
  updateTaskStatus,
};
```

- [ ] **Step 2: Test module loads**

```bash
cd /Users/xiaobo/Documents/Projects/scc-dev-sphere
node -e "const m = require('./scripts/devsphere-state'); console.log(Object.keys(m))"
```
Expected: `[ 'readJSON', 'writeJSON', 'readState', 'writeState', 'readCurrentTask', 'writeCurrentTask', 'getTaskPath', 'updateStageStatus', 'updateTaskStatus' ]`

- [ ] **Step 3: Commit**

```bash
git add scripts/devsphere-state.js
git commit -m "feat: add devsphere-state.js — state I/O module"
```

---

### Task 3: devsphere-workspace.js — Task Workspace Creation

**Files:**
- Create: `scripts/devsphere-workspace.js`

**Interfaces:**
- Consumes: `scripts/devsphere-state.js` (readJSON, writeJSON, writeState, writeCurrentTask)
- Produces:
  - `createFeatureTask(workspaceRoot, taskId, opts)` → taskPath
  - `ensureDirectories(taskPath)` → void
  - `initState(taskPath, opts)` → void

- [ ] **Step 1: Write scripts/devsphere-workspace.js**

```javascript
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { writeState, writeCurrentTask } = require('./devsphere-state');

const DIRS = [
  'inputs',
  'artifacts',
  'reviews',
  'approvals',
  'implementation',
  'verification',
  'links',
  'decisions',
  'evidence/knowledge',
  'evidence/repository',
];

function ensureDirectories(taskPath) {
  for (const dir of DIRS) {
    const fullPath = path.join(taskPath, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  }
}

function initState(taskPath, opts = {}) {
  const state = {
    taskId: opts.taskId || path.basename(taskPath),
    taskType: 'feature',
    workflowMode: opts.workflowMode || 'auto-design',
    humanGateStages: opts.humanGateStages || [],
    status: 'initialized',
    stages: {
      businessDesign: { status: 'not_started', artifact: 'artifacts/business-design.md' },
      solutionDesign: { status: 'not_started', artifact: 'artifacts/solution-design.md' },
      implementationDesign: { status: 'not_started', artifact: 'artifacts/implementation-design.md' },
      testDesign: { status: 'not_started', artifact: 'artifacts/test-design.md' },
    },
  };
  writeState(taskPath, state);
}

function createFeatureTask(workspaceRoot, taskId, opts = {}) {
  const devsphereDir = path.join(workspaceRoot, '.devsphere');
  const taskPath = path.join(devsphereDir, 'tasks', 'feature', taskId);

  if (fs.existsSync(taskPath)) {
    throw new Error(`Task workspace already exists: ${taskPath}`);
  }

  ensureDirectories(taskPath);
  initState(taskPath, { ...opts, taskId });

  // Set as current task
  writeCurrentTask(workspaceRoot, {
    activeTaskId: taskId,
    activeTaskType: 'feature',
    workspaceRoot: workspaceRoot,
    taskPath: `.devsphere/tasks/feature/${taskId}`,
  });

  return taskPath;
}

// --- CLI ---

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'create-feature-task': {
        const workspaceRoot = args[1];
        const taskId = args[2];
        const workflowMode = args[3] || 'auto-design';
        const taskPath = createFeatureTask(workspaceRoot, taskId, { workflowMode });
        process.stdout.write(JSON.stringify({ taskPath }));
        break;
      }
      default:
        process.stderr.write(`Unknown command: ${command}\n`);
        process.exit(1);
    }
  } catch (e) {
    process.stderr.write(`Error: ${e.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { createFeatureTask, ensureDirectories, initState };
```

- [ ] **Step 2: Test workspace creation**

```bash
cd /tmp && rm -rf test-workspace && mkdir test-workspace
node /Users/xiaobo/Documents/Projects/scc-dev-sphere/scripts/devsphere-workspace.js create-feature-task /tmp/test-workspace FEAT-TEST-001 auto-design
find /tmp/test-workspace/.devsphere -type f
```
Expected: Lists `current-task.json` and `state.json` with all directories created. Clean up: `rm -rf /tmp/test-workspace`.

- [ ] **Step 3: Commit**

```bash
git add scripts/devsphere-workspace.js
git commit -m "feat: add devsphere-workspace.js — task workspace creation"
```

---

### Task 4: devsphere-review-matrix.js — Review Matrix Management

**Files:**
- Create: `scripts/devsphere-review-matrix.js`

**Interfaces:**
- Consumes: `scripts/devsphere-state.js` (readJSON, writeJSON)
- Produces:
  - `readMatrix(taskPath)` → matrix object
  - `writeMatrix(taskPath, matrix)` → void
  - `initMatrix(taskPath)` → void
  - `hasBlocking(matrix, artifact)` → boolean
  - `getPendingAdvisoryItems(matrix)` → advisory array
  - `getBaseReviewers(artifact)` → string[]

- [ ] **Step 1: Write scripts/devsphere-review-matrix.js**

```javascript
#!/usr/bin/env node
'use strict';

const path = require('path');
const { readJSON, writeJSON } = require('./devsphere-state');

const MATRIX_PATH = 'reviews/review-matrix.json';

// Base review matrix (spec section 9)
const BASE_REVIEWERS = {
  'business-design': ['se'],
  'solution-design': ['sa', 'mde', 'tse'],
  'implementation-design': ['se', 'dev', 'tse'],
  'test-design': ['sa', 'se', 'mde'],
  'integrated-design': ['sa', 'se', 'mde', 'tse'],
};

function readMatrix(taskPath) {
  return readJSON(path.join(taskPath, MATRIX_PATH));
}

function writeMatrix(taskPath, matrix) {
  writeJSON(path.join(taskPath, MATRIX_PATH), matrix);
}

function getBaseReviewers(artifact) {
  return BASE_REVIEWERS[artifact] || [];
}

function initMatrix(taskPath) {
  const matrix = { artifacts: {} };

  for (const [artifact, reviewers] of Object.entries(BASE_REVIEWERS)) {
    if (artifact === 'integrated-design') continue; // only created after all phases
    matrix.artifacts[artifact] = {
      requiredReviewers: reviewers.map(r => r.toUpperCase()),
      status: 'pending',
      issues: { blocking: 0, advisory: 0, risk_candidate: 0 },
      reviews: {},
    };
  }

  writeMatrix(taskPath, matrix);
  return matrix;
}

function hasBlocking(matrix, artifact) {
  if (!matrix || !matrix.artifacts || !matrix.artifacts[artifact]) return false;
  return matrix.artifacts[artifact].issues.blocking > 0;
}

function getPendingAdvisoryItems(matrix) {
  const items = [];
  if (!matrix || !matrix.artifacts) return items;
  for (const [artifactName, artifact] of Object.entries(matrix.artifacts)) {
    if (artifact.issues.advisory > 0) {
      items.push({ artifact: artifactName, count: artifact.issues.advisory });
    }
  }
  return items;
}

// --- CLI ---

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'init': {
        const taskPath = args[1];
        const matrix = initMatrix(taskPath);
        process.stdout.write(JSON.stringify(matrix));
        break;
      }
      case 'read': {
        const taskPath = args[1];
        const matrix = readMatrix(taskPath);
        process.stdout.write(JSON.stringify(matrix));
        break;
      }
      case 'has-blocking': {
        const taskPath = args[1];
        const artifact = args[2];
        const matrix = readMatrix(taskPath);
        process.stdout.write(JSON.stringify({ blocking: hasBlocking(matrix, artifact) }));
        break;
      }
      default:
        process.stderr.write(`Unknown command: ${command}\n`);
        process.exit(1);
    }
  } catch (e) {
    process.stderr.write(`Error: ${e.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  readMatrix, writeMatrix, initMatrix,
  hasBlocking, getPendingAdvisoryItems, getBaseReviewers,
  BASE_REVIEWERS,
};
```

- [ ] **Step 2: Test review matrix init**

```bash
mkdir -p /tmp/test-review
node -e "
const { initMatrix } = require('/Users/xiaobo/Documents/Projects/scc-dev-sphere/scripts/devsphere-review-matrix');
const m = initMatrix('/tmp/test-review');
console.log(JSON.stringify(m, null, 2));
"
```
Expected: Matrix with `business-design`, `solution-design`, `implementation-design`, `test-design` entries, all pending.

- [ ] **Step 3: Commit**

```bash
git add scripts/devsphere-review-matrix.js
git commit -m "feat: add devsphere-review-matrix.js — review matrix management"
```

---

### Task 5: devsphere-approval.js — Approval I/O & Validation

**Files:**
- Create: `scripts/devsphere-approval.js`

**Interfaces:**
- Consumes: `scripts/devsphere-state.js` (readState), `scripts/devsphere-review-matrix.js` (hasBlocking, getPendingAdvisoryItems)
- Produces:
  - `readApproval(taskPath, type)` → approval object
  - `writeApproval(taskPath, approval)` → void
  - `validateDesignReady(taskPath)` → {valid: boolean, issues: string[]}

- [ ] **Step 1: Write scripts/devsphere-approval.js**

```javascript
#!/usr/bin/env node
'use strict';

const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { readState } = require('./devsphere-state');
const { readMatrix, hasBlocking, getPendingAdvisoryItems } = require('./devsphere-review-matrix');

const APPROVAL_TYPES = {
  DESIGN_FINAL: 'design-final-approval',
  IMPLEMENTATION_PLAN: 'implementation-plan-approval',
};

function readApproval(taskPath, type) {
  const approvalPath = path.join(taskPath, 'approvals', `${type}.json`);
  try {
    return JSON.parse(fs.readFileSync(approvalPath, 'utf-8'));
  } catch (e) {
    return null;
  }
}

function writeApproval(taskPath, approval) {
  const approvalDir = path.join(taskPath, 'approvals');
  if (!fs.existsSync(approvalDir)) {
    fs.mkdirSync(approvalDir, { recursive: true });
  }
  const fileName = `${approval.type}.json`;
  fs.writeFileSync(
    path.join(approvalDir, fileName),
    JSON.stringify(approval, null, 2),
    'utf-8'
  );
}

function hashFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return 'sha256:' + crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  } catch (e) {
    return null;
  }
}

function validateDesignReady(taskPath) {
  const issues = [];
  const state = readState(taskPath);

  if (!state) {
    return { valid: false, issues: ['State file not found'] };
  }

  // Check task status
  if (state.status !== 'designing') {
    issues.push(`Task status must be 'designing' to reach design_ready, got '${state.status}'`);
  }

  // Check all stage statuses
  const requiredStages = ['businessDesign', 'solutionDesign', 'implementationDesign', 'testDesign'];
  for (const stage of requiredStages) {
    const stageState = state.stages[stage];
    if (!stageState) {
      issues.push(`Stage ${stage} not found in state`);
      continue;
    }
    // Mode-specific readiness check — simplified: at minimum need ai_review_passed
    if (stageState.status === 'not_started' || stageState.status === 'drafted') {
      issues.push(`Stage ${stage} is '${stageState.status}', must reach at least ai_review_passed`);
    }
  }

  // Check review matrix
  const matrix = readMatrix(taskPath);
  if (!matrix) {
    issues.push('Review matrix not found');
    return { valid: false, issues };
  }

  for (const [artifactName, artifact] of Object.entries(matrix.artifacts)) {
    if (artifactName === 'integrated-design') continue;
    if (hasBlocking(matrix, artifactName)) {
      issues.push(`Artifact ${artifactName} has unclosed blocking issues`);
    }
  }

  // Check advisory items
  const pendingAdvisory = getPendingAdvisoryItems(matrix);
  if (pendingAdvisory.length > 0) {
    // Check advisory-confirmation.json
    const confirmPath = path.join(taskPath, 'reviews', 'advisory-confirmation.json');
    try {
      const confirm = JSON.parse(fs.readFileSync(confirmPath, 'utf-8'));
      const confirmedIds = new Set((confirm.items || []).map(i => i.advisoryId));
      // Only flag if advisory count > confirmed count (simplified check)
    } catch (e) {
      issues.push(`Pending advisory items without confirmation: ${pendingAdvisory.map(a => a.artifact).join(', ')}`);
    }
  }

  // Check integrated design exists
  const integratedPath = path.join(taskPath, 'artifacts', 'integrated-design.md');
  if (!fs.existsSync(integratedPath)) {
    issues.push('integrated-design.md not found');
  }

  // Check accepted_risk in decisions
  // (simplified: check decision files exist for stages that reached ai_review_passed)
  const decisionFiles = ['business-design-decisions.md', 'solution-design-decisions.md',
    'implementation-design-decisions.md', 'test-design-decisions.md'];
  for (const df of decisionFiles) {
    // Not strictly required for all, just a soft check
  }

  return { valid: issues.length === 0, issues };
}

// --- CLI ---

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'validate-design-ready': {
        const taskPath = args[1];
        const result = validateDesignReady(taskPath);
        process.stdout.write(JSON.stringify(result));
        if (!result.valid) process.exit(1);
        break;
      }
      default:
        process.stderr.write(`Unknown command: ${command}\n`);
        process.exit(1);
    }
  } catch (e) {
    process.stderr.write(`Error: ${e.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { readApproval, writeApproval, validateDesignReady, hashFile, APPROVAL_TYPES };
```

- [ ] **Step 2: Verify module loads**

```bash
node -e "const m = require('./scripts/devsphere-approval'); console.log(Object.keys(m))"
```
Expected: `[ 'readApproval', 'writeApproval', 'validateDesignReady', 'hashFile', 'APPROVAL_TYPES' ]`

- [ ] **Step 3: Commit**

```bash
git add scripts/devsphere-approval.js
git commit -m "feat: add devsphere-approval.js — approval I/O and design_ready validation"
```

---

### Task 6: devsphere-guard.js — Hook Guard Checks

**Files:**
- Create: `scripts/devsphere-guard.js`

**Interfaces:**
- Consumes: `scripts/devsphere-state.js` (getTaskPath, readState, readCurrentTask)
- Produces:
  - `checkImplementEntry(workspaceRoot)` → {allowed: boolean, reason: string}
  - `checkApproveEntry(workspaceRoot)` → {allowed: boolean, reason: string}
  - `checkStateAdvance(taskPath, targetStatus)` → {allowed: boolean, reason: string}
  - `hasActiveTask(workspaceRoot)` → boolean

- [ ] **Step 1: Write scripts/devsphere-guard.js**

```javascript
#!/usr/bin/env node
'use strict';

const path = require('path');
const { getTaskPath, readState, readCurrentTask } = require('./devsphere-state');

const ALLOWED_IMPLEMENT_STATUSES = ['implementation_planned', 'implementing'];

function hasActiveTask(workspaceRoot) {
  const current = readCurrentTask(workspaceRoot);
  return !!(current && current.activeTaskId);
}

function checkImplementEntry(workspaceRoot) {
  if (!hasActiveTask(workspaceRoot)) {
    return { allowed: false, reason: 'No active task. Create a feature task first with /scc-dev-sphere:feature-init.' };
  }

  const taskPath = getTaskPath(workspaceRoot);
  if (!taskPath) {
    return { allowed: false, reason: 'Cannot resolve task path from current-task.json.' };
  }

  const state = readState(taskPath);
  if (!state) {
    return { allowed: false, reason: 'State file not found for active task.' };
  }

  if (!ALLOWED_IMPLEMENT_STATUSES.includes(state.status)) {
    return {
      allowed: false,
      reason: `Task status is '${state.status}'. Code implementation requires 'implementation_planned' or 'implementing'. Complete design, approval, and planning first.`,
    };
  }

  // Check implementation plan exists
  const planPath = path.join(taskPath, 'implementation', 'implementation-plan.md');
  const fs = require('fs');
  if (state.status === 'implementation_planned' && !fs.existsSync(planPath)) {
    return {
      allowed: false,
      reason: 'Implementation plan not found. Generate it first with /scc-dev-sphere:feature-plan-implementation.',
    };
  }

  return { allowed: true, reason: 'OK' };
}

function checkApproveEntry(workspaceRoot) {
  if (!hasActiveTask(workspaceRoot)) {
    return { allowed: false, reason: 'No active task.' };
  }

  const taskPath = getTaskPath(workspaceRoot);
  if (!taskPath) {
    return { allowed: false, reason: 'Cannot resolve task path.' };
  }

  const state = readState(taskPath);
  if (!state) {
    return { allowed: false, reason: 'State file not found.' };
  }

  if (state.status !== 'design_ready') {
    return {
      allowed: false,
      reason: `Task status is '${state.status}'. Design approval requires 'design_ready'. Complete all design phases and integrated review first.`,
    };
  }

  return { allowed: true, reason: 'OK' };
}

function checkStateAdvance(taskPath, targetStatus) {
  const state = readState(taskPath);
  if (!state) {
    return { allowed: false, reason: 'State file not found.' };
  }

  // Valid state transitions (spec section 4)
  const VALID_TRANSITIONS = {
    'initialized': ['assessed'],
    'assessed': ['designing'],
    'designing': ['design_ready', 'blocked'],
    'design_ready': ['approved_for_implementation', 'designing'],
    'approved_for_implementation': ['implementation_planned', 'designing'],
    'implementation_planned': ['implementing'],
    'implementing': ['verification_ready'],
    'verification_ready': ['completed', 'implementing', 'blocked'],
    'blocked': ['designing', 'implementing'],
    'completed': [],
  };

  const allowed = VALID_TRANSITIONS[state.status] || [];
  if (!allowed.includes(targetStatus)) {
    return {
      allowed: false,
      reason: `Invalid transition from '${state.status}' to '${targetStatus}'. Allowed: ${allowed.join(', ')}`,
    };
  }

  return { allowed: true, reason: 'OK' };
}

// --- CLI ---

function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const workspaceRoot = args[1];

  try {
    let result;
    switch (command) {
      case 'check-implement':
        result = checkImplementEntry(workspaceRoot);
        break;
      case 'check-approve':
        result = checkApproveEntry(workspaceRoot);
        break;
      case 'check-advance':
        result = checkStateAdvance(args[1], args[2]);
        break;
      default:
        process.stderr.write(`Unknown command: ${command}\n`);
        process.exit(1);
    }
    process.stdout.write(JSON.stringify(result));
    if (!result.allowed) process.exit(1);
  } catch (e) {
    process.stderr.write(JSON.stringify({ allowed: false, reason: e.message }));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { checkImplementEntry, checkApproveEntry, checkStateAdvance, hasActiveTask };
```

- [ ] **Step 2: Test guard module**

```bash
node -e "
const g = require('./scripts/devsphere-guard');
console.log('hasActiveTask:', g.hasActiveTask('/tmp/fake'));
console.log('implement:', g.checkImplementEntry('/tmp/fake'));
"
```
Expected: `hasActiveTask: false`, `implement: { allowed: false, reason: 'No active task...' }`

- [ ] **Step 3: Commit**

```bash
git add scripts/devsphere-guard.js
git commit -m "feat: add devsphere-guard.js — hook guard checks for implement/approve entry"
```

---

### Task 7: devsphere-workflow.js — Workflow Router

**Files:**
- Create: `scripts/devsphere-workflow.js`

**Interfaces:**
- Consumes: `scripts/devsphere-state.js` (readCurrentTask, readState, getTaskPath)
- Produces:
  - `routeWorkflow(workspaceRoot)` → nextAction object

- [ ] **Step 1: Write scripts/devsphere-workflow.js**

```javascript
#!/usr/bin/env node
'use strict';

const { readCurrentTask, readState, getTaskPath } = require('./devsphere-state');

// MVP: only feature resolver exists
const RESOLVERS = {
  feature: './workflows/feature-workflow',
};

function routeWorkflow(workspaceRoot) {
  const current = readCurrentTask(workspaceRoot);

  if (!current || !current.activeTaskId) {
    return {
      kind: 'show_status',
      taskType: null,
      taskId: null,
      status: null,
      stage: null,
      target: null,
      skill: null,
      args: {},
      agents: [],
      reason: 'No active task. Use /scc-dev-sphere:feature-init to create a feature task.',
      requiredArtifacts: [],
      expectedArtifacts: [],
      pause: null,
    };
  }

  const taskPath = getTaskPath(workspaceRoot);
  if (!taskPath) {
    return {
      kind: 'blocked',
      taskType: current.activeTaskType,
      taskId: current.activeTaskId,
      status: null,
      stage: null,
      target: null,
      skill: null,
      args: {},
      agents: [],
      reason: 'Task path could not be resolved from current-task.json.',
      requiredArtifacts: [],
      expectedArtifacts: [],
      pause: null,
    };
  }

  const state = readState(taskPath);
  if (!state) {
    return {
      kind: 'blocked',
      taskType: current.activeTaskType,
      taskId: current.activeTaskId,
      status: null,
      stage: null,
      target: null,
      skill: null,
      args: {},
      agents: [],
      reason: 'State file not found for active task.',
      requiredArtifacts: [],
      expectedArtifacts: [],
      pause: null,
    };
  }

  // Route to taskType-specific resolver
  const taskType = state.taskType || current.activeTaskType;
  if (!RESOLVERS[taskType]) {
    return {
      kind: 'show_status',
      taskType,
      taskId: state.taskId,
      status: state.status,
      stage: null,
      target: null,
      skill: null,
      args: {},
      agents: [],
      reason: `Task type '${taskType}' is not yet implemented in MVP. Only 'feature' is supported.`,
      requiredArtifacts: [],
      expectedArtifacts: [],
      pause: null,
    };
  }

  const resolver = require(RESOLVERS[taskType]);
  return resolver.resolveNextAction(taskPath, state);
}

// --- CLI ---

function main() {
  const args = process.argv.slice(2);
  const workspaceRoot = args[0] || process.cwd();

  try {
    const nextAction = routeWorkflow(workspaceRoot);
    process.stdout.write(JSON.stringify(nextAction, null, 2));
  } catch (e) {
    process.stderr.write(`Error: ${e.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { routeWorkflow };
```

- [ ] **Step 2: Verify module loads (resolver won't exist yet, but route function should)**

```bash
node -e "
const { routeWorkflow } = require('./scripts/devsphere-workflow');
const result = routeWorkflow('/tmp/fake');
console.log(result.kind, result.reason.substring(0, 40));
"
```
Expected: `show_status No active task. Use /scc-dev-sphere:featu`

- [ ] **Step 3: Commit**

```bash
git add scripts/devsphere-workflow.js
git commit -m "feat: add devsphere-workflow.js — workflow router with taskType delegation"
```

---

### Task 8: workflows/feature-workflow.js — Feature NextAction Resolver

**Files:**
- Create: `scripts/workflows/feature-workflow.js`

**Interfaces:**
- Consumes: `scripts/devsphere-state.js` (readState), `scripts/devsphere-review-matrix.js` (readMatrix, hasBlocking)
- Produces:
  - `resolveNextAction(taskPath, state)` → nextAction object (implements the full decision table from spec section 8)

- [ ] **Step 1: Write scripts/workflows/feature-workflow.js**

```javascript
'use strict';

const path = require('path');
const fs = require('fs');
const { readMatrix, hasBlocking } = require('../devsphere-review-matrix');

/**
 * Feature workflow decision table (spec section 8).
 * Returns a nextAction object describing the single minimal next step.
 */
function resolveNextAction(taskPath, state) {
  const status = state.status;
  const stages = state.stages || {};
  const mode = state.workflowMode || 'auto-design';
  const humanGates = state.humanGateStages || [];

  // --- No active task edge case (handled by router) ---

  // --- initialized ---
  if (status === 'initialized') {
    return makeAction('run_skill', state, null, null,
      'feature-assess', {}, ['sa'],
      'Task initialized. Proceed with complexity and risk assessment.',
      [], []);
  }

  // --- assessed ---
  if (status === 'assessed') {
    return makeAction('run_skill', state, 'businessDesign', 'business-design',
      'feature-design-business', {}, ['sa'],
      'Assessment complete. Begin business design.',
      [], ['artifacts/business-design.md']);
  }

  // --- designing ---
  if (status === 'designing') {
    return resolveDesigning(taskPath, state, stages, mode, humanGates);
  }

  // --- design_ready ---
  if (status === 'design_ready') {
    return makeAction('run_skill', state, null, 'design-final',
      'feature-approve', {}, [],
      'All design phases complete. Proceed with final design approval.',
      ['artifacts/integrated-design.md', 'reviews/review-matrix.json'],
      ['approvals/design-final-approval.json']);
  }

  // --- approved_for_implementation ---
  if (status === 'approved_for_implementation') {
    return makeAction('run_skill', state, null, 'implementation-plan',
      'feature-plan-implementation', {}, ['dev'],
      'Design approved. Generate implementation plan before coding.',
      ['approvals/design-final-approval.json'],
      ['implementation/implementation-plan.md']);
  }

  // --- implementation_planned ---
  if (status === 'implementation_planned') {
    return makeAction('run_skill', state, null, 'implementation',
      'feature-implement', {}, ['dev'],
      'Implementation plan ready. Begin code implementation. First code change requires human confirmation.',
      ['implementation/implementation-plan.md', 'links/repos.json'],
      ['implementation/implementation-log.md']);
  }

  // --- implementing ---
  if (status === 'implementing') {
    return makeAction('run_skill', state, null, 'implementation',
      'feature-implement', {}, ['dev'],
      'Continue implementation, fix issues, or supplement tests.',
      [], []);
  }

  // --- verification_ready ---
  if (status === 'verification_ready') {
    return makeAction('run_skill', state, null, 'verification',
      'feature-verify', {}, ['dev'],
      'Code implementation complete. Run verification and generate test handoff package.',
      [], ['verification/test-handoff.md']);
  }

  // --- completed ---
  if (status === 'completed') {
    return makeAction('completed', state, null, null, null, {}, [],
      'Task is completed. No further workflow actions available.',
      [], []);
  }

  // --- blocked ---
  if (status === 'blocked') {
    return makeAction('blocked', state, null, null, null, {}, [],
      'Task is blocked. Review the blocked reason and resolve before continuing.',
      [], []);
  }

  // --- fallback ---
  return makeAction('show_status', state, null, null, null, {}, [],
    `Unknown or unhandled status: ${status}`,
    [], []);
}

function resolveDesigning(taskPath, state, stages, mode, humanGates) {
  const stageOrder = ['businessDesign', 'solutionDesign', 'implementationDesign', 'testDesign'];
  const matrix = readMatrix(taskPath);

  // Check each stage in order
  for (const stageName of stageOrder) {
    const stage = stages[stageName];
    if (!stage) continue;

    const isReady = isStageReady(stage.status, stageName, mode, humanGates);

    if (!isReady) {
      // Check if stage needs review (has artifact but not reviewed)
      if (stage.status === 'drafted' && matrix) {
        const artifactTarget = stageToArtifact(stageName);
        if (matrix.artifacts[artifactTarget] &&
            matrix.artifacts[artifactTarget].status !== 'pending') {
          // Has been reviewed — check for blocking
          if (hasBlocking(matrix, artifactTarget)) {
            return makeHumanConfirm(state, stageName, artifactTarget,
              `Stage ${stageName} has unclosed blocking issues. Return to design agent for revision.`);
          }
          // No blocking but not ai_review_passed — needs review
          const reviewers = getDesignReviewers(stageName);
          return makeAction('run_skill', state, stageName, artifactTarget,
            getDesignSkill(stageName), { mode: 'revise' }, reviewers,
            `Stage ${stageName} has blocking issues. Revise design and re-review.`,
            [stage.artifact], [stage.artifact]);
        }
      }

      // Need to generate/revise design
      const artifactTarget = stageToArtifact(stageName);
      const designAgent = getDesignAgent(stageName);

      if (stage.status === 'not_started') {
        return makeAction('run_skill', state, stageName, artifactTarget,
          getDesignSkill(stageName), {}, [designAgent],
          `Stage ${stageName} is not started. Begin design.`,
          [], [stage.artifact || `artifacts/${artifactTarget}.md`]);
      }

      // drafted — needs review
      const reviewers = getDesignReviewers(stageName);
      return makeAction('run_skill', state, stageName, artifactTarget,
        'feature-review', { target: artifactTarget }, reviewers,
        `Stage ${stageName} is drafted and ready for formal AI review.`,
        [stage.artifact, 'reviews/review-matrix.json'],
        reviewers.map(r => `reviews/${artifactTarget}/${r}-review.md`).concat(['reviews/review-matrix.json']));
    }

    // Stage is ready — check if next stage needs review scheduling
    if (stage.status === 'ai_review_passed' && mode !== 'auto-design') {
      if ((mode === 'strict-human-loop') ||
          (mode === 'collaborative-design' && humanGates.includes(stageName))) {
        return makeAction('human_confirm', state, stageName, stageToArtifact(stageName),
          null, {}, [],
          `Stage ${stageName} passed AI review. Human confirmation required before proceeding.`,
          [stage.artifact],
          [],
          { type: 'stage_approval', prompt: `请确认 ${stageName} 阶段设计是否通过人工评审。回复 OK 确认通过，或提出修改意见。` });
      }
    }
  }

  // All 4 stages ready — check integrated design
  const integratedPath = path.join(taskPath, 'artifacts', 'integrated-design.md');
  if (!fs.existsSync(integratedPath)) {
    return makeAction('run_skill', state, 'integration', 'integrated-design',
      'feature-design', {}, ['sa', 'se', 'mde', 'tse'],
      'All design phases complete. Generate integrated design.',
      stageOrder.map(s => stages[s]?.artifact).filter(Boolean),
      ['artifacts/integrated-design.md']);
  }

  // Check integrated review
  if (matrix && matrix.artifacts['integrated-design'] &&
      matrix.artifacts['integrated-design'].status !== 'passed') {
    return makeAction('run_skill', state, 'integration', 'integrated-design',
      'feature-review', { target: 'integrated-design' }, ['sa', 'se', 'mde', 'tse'],
      'Integrated design needs consistency review.',
      ['artifacts/integrated-design.md', 'reviews/review-matrix.json'],
      ['reviews/review-matrix.json']);
  }

  // All done — ready for design_ready
  return makeAction('show_status', state, null, null, null, {}, [],
    'All design phases complete with reviews passed. Task can advance to design_ready.',
    [], []);
}

// --- Helpers ---

function isStageReady(stageStatus, stageName, mode, humanGates) {
  if (mode === 'strict-human-loop') return stageStatus === 'human_approved';
  if (mode === 'collaborative-design' && humanGates.includes(stageName)) {
    return stageStatus === 'human_approved';
  }
  return stageStatus === 'ai_review_passed' || stageStatus === 'human_approved';
}

function stageToArtifact(stageName) {
  const map = {
    businessDesign: 'business-design',
    solutionDesign: 'solution-design',
    implementationDesign: 'implementation-design',
    testDesign: 'test-design',
  };
  return map[stageName] || stageName;
}

function getDesignSkill(stageName) {
  const map = {
    businessDesign: 'feature-design-business',
    solutionDesign: 'feature-design-solution',
    implementationDesign: 'feature-design-implementation',
    testDesign: 'feature-design-test',
  };
  return map[stageName];
}

function getDesignAgent(stageName) {
  const map = {
    businessDesign: 'sa',
    solutionDesign: 'se',
    implementationDesign: 'mde',
    testDesign: 'tse',
  };
  return map[stageName];
}

function getDesignReviewers(stageName) {
  const map = {
    businessDesign: ['se'],
    solutionDesign: ['sa', 'mde', 'tse'],
    implementationDesign: ['se', 'dev', 'tse'],
    testDesign: ['sa', 'se', 'mde'],
  };
  return map[stageName] || [];
}

function makeAction(kind, state, stage, target, skill, args, agents, reason, required, expected, pause) {
  return {
    kind,
    taskType: 'feature',
    taskId: state.taskId,
    status: state.status,
    stage: stage || null,
    target: target || null,
    skill: skill || null,
    args: args || {},
    agents: agents || [],
    reason,
    requiredArtifacts: required || [],
    expectedArtifacts: expected || [],
    pause: pause || null,
  };
}

function makeHumanConfirm(state, stage, target, reason, required, expected, pause) {
  return makeAction('human_confirm', state, stage, target, null, {}, [],
    reason, required || [], expected || [], pause || null);
}

module.exports = { resolveNextAction };
```

- [ ] **Step 2: Test feature resolver with a mock state**

```bash
node -e "
const resolver = require('./scripts/workflows/feature-workflow');

// Test initialized state
let state = {
  taskId: 'FEAT-TEST-001', taskType: 'feature',
  workflowMode: 'auto-design', humanGateStages: [],
  status: 'initialized', stages: {}
};
let result = resolver.resolveNextAction('/tmp/test', state);
console.log('initialized:', result.kind, result.skill, result.reason);

// Test assessed state
state.status = 'assessed';
result = resolver.resolveNextAction('/tmp/test', state);
console.log('assessed:', result.kind, result.skill, result.reason);

// Test completed state
state.status = 'completed';
result = resolver.resolveNextAction('/tmp/test', state);
console.log('completed:', result.kind, result.reason);
"
```
Expected:
```
initialized: run_skill feature-assess Task initialized...
assessed: run_skill feature-design-business Assessment complete...
completed: completed Task is completed...
```

- [ ] **Step 3: Commit**

```bash
git add scripts/workflows/feature-workflow.js
git commit -m "feat: add feature-workflow.js — feature nextAction resolver with decision table"
```

---

## Phase 3: Agents — Role Context Definitions

### Task 9: sa.md — SA (Business Analyst) Agent

**Files:**
- Create: `agents/sa.md`

- [ ] **Step 1: Write agents/sa.md**

```markdown
---
name: sa
description: Business Analyst — focuses on business requirements, rules, scope, and terminology. Use for business design, requirement clarification, and reviewing business consistency.
---

# SA — Business Analyst

You are an SA (Business Analyst) agent in the scc-dev-sphere plugin. Your role is to ensure business correctness and completeness in the feature development workflow.

## Core Responsibilities

1. **Business Design** (`feature-design-business` skill): Analyze requirements, define business rules, scope boundaries, terminology, and exception flows. Query knowledge base for existing business rules and historical requirements. Save evidence snapshots for all factual claims.

2. **Review** (`feature-review` skill): Review solution design and test design from a business perspective. Check:
   - Does the solution align with business requirements?
   - Are business rules correctly reflected?
   - Does the test design cover business-critical scenarios?
   - Are scope boundaries respected?

## Knowledge Querying

Use the `knowledge-query` skill to search the knowledge base for:
- Existing business rules and processes
- Historical requirement designs
- Current system behavior documentation
- Terminology and domain definitions

Save all query results actually used in design as evidence (`evidence/knowledge/`).

## Design Principles

- Every factual claim about existing business behavior MUST cite an evidence ID (`依据：EV-xxx`).
- Premises without evidence MUST be marked as `assumption` and flagged for human confirmation.
- Distinguish clearly between "current state" (evidence-based) and "new design" (decision-based).
- Document trade-offs and rejected alternatives in the decisions file.

## Artifact Ownership

You own `artifacts/business-design.md` and `decisions/business-design-decisions.md`.
```

- [ ] **Step 2: Commit**

```bash
git add agents/sa.md
git commit -m "feat: add SA agent definition"
```

---

### Task 10: se.md — SE (System Engineer) Agent

**Files:**
- Create: `agents/se.md`

- [ ] **Step 1: Write agents/se.md**

```markdown
---
name: se
description: System Engineer — focuses on system architecture, interface contracts, and cross-module consistency. Use for solution design and architectural review.
---

# SE — System Engineer

You are an SE (System Engineer) agent in the scc-dev-sphere plugin. You are responsible for system-level design consistency and cross-module integration.

## Core Responsibilities

1. **Solution Design** (`feature-design-solution` skill): Design system architecture, API contracts, data models, and integration points. Query knowledge base for existing architecture specs, interface standards, and compatibility constraints.

2. **Review** (`feature-review` skill): Review ALL design artifacts from an architectural perspective:
   - **business-design**: Verify business rules are architecturally feasible
   - **implementation-design**: Check module boundaries, interface adherence, and implementation feasibility
   - **test-design**: Verify test coverage of integration points and cross-module scenarios

## Knowledge Querying

Use `knowledge-query` to search for:
- Existing architecture specifications and standards
- Interface contracts and API documentation
- Cross-module dependency and compatibility constraints
- Historical design decisions

## Design Principles

- Define clear system boundaries and interface contracts.
- Every architecture decision must be traceable to a decision record.
- Flag cross-module impacts explicitly.
- When querying code repositories, save lightweight repository evidence (paths, symbols, call relationships — not large source dumps).

## Artifact Ownership

You own `artifacts/solution-design.md` and `decisions/solution-design-decisions.md`.
```

- [ ] **Step 2: Commit**

```bash
git add agents/se.md
git commit -m "feat: add SE agent definition"
```

---

### Tasks 11-14: Remaining Agents

**Files:**
- Create: `agents/mde.md`, `agents/dev.md`, `agents/tse.md`, `agents/cie.md`

- [ ] **Step 1: Write agents/mde.md**

```markdown
---
name: mde
description: Module Development Expert — focuses on module-level implementation design, impact analysis, and feature decomposition. Use for implementation design and module feasibility review.
---

# MDE — Module Development Expert

You are an MDE (Module Development Expert) agent. You own module-level implementation design and feasibility analysis.

## Core Responsibilities

1. **Implementation Design** (`feature-design-implementation` skill): Analyze module impact, decompose features into implementable units, define technical approach and implementation scope. Query code repositories for module structure, call chains, and existing implementation patterns.

2. **Review** (`feature-review` skill):
   - **solution-design**: Review implementation feasibility and module impact
   - **test-design**: Review module coverage and implementation-level test scenarios

## Key Focus

- Module boundaries and internal structure
- Call chains and dependency graphs
- Technical constraints and existing implementation patterns
- Risk identification at module level

## Artifact Ownership

You own `artifacts/implementation-design.md` and `decisions/implementation-design-decisions.md`.
```

- [ ] **Step 2: Write agents/dev.md**

```markdown
---
name: dev
description: Developer — focuses on code implementation, local verification, and development risk. Use for implementation planning, code delivery, and reviewing implementation designs for codeability.
---

# DEV — Developer

You are a DEV (Developer) agent. You are the unified development role — not split into frontend/backend by default. Use specialized skills (`backend-development`, `frontend-development`, `fullstack-change-planning`) as needed based on implementation scope.

## Core Responsibilities

1. **Implementation Planning** (`feature-plan-implementation` skill): Generate implementation plan with repo binding, file/module changes, step sequence, test commands, rollback strategy, and risk controls.

2. **Code Implementation** (`feature-implement` skill): Execute code changes, run local tests, generate diff summaries. First code change requires human confirmation. Report scope deviations.

3. **Verification** (`feature-verify` skill): Run local verification, generate test handoff package.

4. **Review** (`feature-review` skill): Review implementation design for codeability, code impact, and development risk.

## Specialized Skills

- `backend-development`: Backend APIs, services, data access, jobs, configs
- `frontend-development`: Pages, components, interactions, state, API adaptation
- `fullstack-change-planning`: Cross-stack coordination, interface contracts, integration order

## Key Rules

- NEVER modify code before implementation plan is generated and status allows it.
- First code change from `implementation_planned` MUST display summary and get human confirmation.
- Generate diff summary before declaring code complete.
- Flag scope deviations compared to implementation plan.
```

- [ ] **Step 3: Write agents/tse.md**

```markdown
---
name: tse
description: Test Engineer — focuses on test strategy, acceptance criteria, and regression risk. Use for test design and reviewing testability of designs.
---

# TSE — Test Engineer

You are a TSE (Test Engineer) agent. You own test design and quality verification strategy.

## Core Responsibilities

1. **Test Design** (`feature-design-test` skill): Define test strategy, acceptance criteria, test scenarios, regression scope, and risk-based test approach. Query knowledge base for historical defects, test standards, and existing test assets.

2. **Review** (`feature-review` skill):
   - **solution-design**: Review testability of the proposed solution
   - **implementation-design**: Review test impact and verification approach

## Key Focus

- Acceptance criteria clarity and coverage
- Regression risk identification
- Test strategy for edge cases and error paths
- Test environment and data requirements

## Artifact Ownership

You own `artifacts/test-design.md` and `decisions/test-design-decisions.md`.
```

- [ ] **Step 4: Write agents/cie.md**

```markdown
---
name: cie
description: CI/CD & Environment Engineer — on-demand agent for deployment, configuration, pipeline, and environment risks. Not in the default workflow; triggered by risk detection.
---

# CIE — CI/CD & Environment Engineer

You are a CIE (CI/CD & Environment) agent. You are NOT part of the default workflow — you are triggered on-demand when deployment, configuration, pipeline, environment, or release risks are detected.

## Trigger Conditions

You are activated when the feature assessment or design review identifies:
- Deployment process changes
- Configuration or environment variable changes
- CI/CD pipeline modifications
- Database migration or data model changes
- Release strategy or environment impact
- Infrastructure or platform changes

## Core Responsibilities

1. **Review** (`feature-review` skill): Review relevant design artifacts for deployment, configuration, environment, and CI/CD impact.

2. **Advisory**: Provide deployment checklists, environment preparation guidance, and CI/CD configuration recommendations for the test handoff package.

## Key Focus

- Deployment and rollback strategies
- Environment consistency (dev/test/staging/prod)
- Configuration management
- Pipeline impact and artifact management
```

- [ ] **Step 5: Commit all agents**

```bash
git add agents/mde.md agents/dev.md agents/tse.md agents/cie.md
git commit -m "feat: add MDE, DEV, TSE, CIE agent definitions"
```

---

## Phase 4: Hooks — Guard Configuration

### Task 15: hooks.json — Hook Event Configuration

**Files:**
- Create: `hooks/hooks.json`

**Interfaces:**
- Consumes: `scripts/devsphere-guard.js` (CLI mode), `scripts/devsphere-state.js` (CLI mode)
- Produces: Hook configuration loaded by Claude Code automatically

- [ ] **Step 1: Write hooks/hooks.json**

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/scripts/devsphere-guard.js\" check-implement \"${CLAUDE_PLUGIN_ROOT}/..\""
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/scripts/devsphere-state.js\" sync-artifact \"${CLAUDE_PLUGIN_ROOT}/..\""
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Verify hooks.json is valid JSON**

```bash
node -e "const h = require('./hooks/hooks.json'); console.log('Hooks loaded:', Object.keys(h.hooks))"
```
Expected: `Hooks loaded: [ 'UserPromptSubmit', 'PostToolUse' ]`

- [ ] **Step 3: Commit**

```bash
git add hooks/hooks.json
git commit -m "feat: add hooks.json — UserPromptSubmit guard + PostToolUse state sync"
```

---

## Phase 5: Templates

### Task 16: Artifact & Process Templates

**Files:**
- Create: `templates/artifacts/business-design.md`
- Create: `templates/artifacts/solution-design.md`
- Create: `templates/artifacts/implementation-design.md`
- Create: `templates/artifacts/test-design.md`
- Create: `templates/artifacts/integrated-design.md`
- Create: `templates/reviews/review-template.md`
- Create: `templates/approvals/approval-template.json`
- Create: `templates/verification/test-handoff-template.md`

- [ ] **Step 1: Write templates/artifacts/business-design.md**

```markdown
# Business Design: {{TASK_ID}}

## 1. Business Objectives
<!-- What business goal does this feature serve? -->

## 2. Scope
### In Scope
<!-- What is included -->

### Out of Scope
<!-- What is explicitly excluded -->

## 3. Current State Analysis
<!-- How does the business process work today? Cite evidence IDs. -->
依据：

## 4. Business Rules
<!-- Enumerate all business rules, constraints, and validations -->

## 5. Terminology
<!-- Define key business terms used in this design -->

## 6. Business Process / Flow
<!-- Describe the business flow, including normal path and exception paths -->

## 7. Stakeholders & Impact
<!-- Who is affected by this change? -->

## 8. Assumptions
<!-- Mark unverified premises as assumption; human confirmation required -->
| ID | Assumption | Confidence | Needs Confirmation |
|----|-----------|------------|-------------------|
|    |           |            |                    |

## 9. Open Questions
<!-- Questions requiring human input before design can proceed -->

## 10. Evidence References
<!-- List all evidence IDs used in this design -->
```

- [ ] **Step 2: Write templates/artifacts/solution-design.md**

```markdown
# Solution Design: {{TASK_ID}}

## 1. Architecture Overview
<!-- High-level architecture diagram or description -->

## 2. System Boundaries & Interfaces
### External Interfaces
<!-- API contracts, message formats, integration points -->

### Internal Module Boundaries
<!-- Module responsibilities and interfaces -->

## 3. Data Model Impact
<!-- Data changes: new tables, columns, migrations, data flow -->

## 4. Component Design
<!-- Key components, services, or modules and their responsibilities -->

## 5. API / Interface Contracts
<!-- Detailed API specifications -->

## 6. Compatibility & Migration
<!-- Backward compatibility, migration strategy, deprecation -->

## 7. Cross-Module Impact Analysis
<!-- How other modules are affected -->

## 8. Non-Functional Considerations
<!-- Performance, security, scalability, reliability -->

## 9. Risks & Constraints
| Risk | Severity | Mitigation |
|------|----------|------------|
|      |          |            |

## 10. Decisions
<!-- Reference: decisions/solution-design-decisions.md -->

## 11. Evidence References
依据：
```

- [ ] **Step 3: Write templates/artifacts/implementation-design.md**

```markdown
# Implementation Design: {{TASK_ID}}

## 1. Module Impact Summary
<!-- Which modules are affected and how -->

## 2. Feature Decomposition
<!-- Break down the feature into implementable units -->

## 3. Technical Approach
### Key Algorithms / Patterns
<!-- Implementation approach for each unit -->

### Dependencies
<!-- Libraries, services, modules depended on -->

## 4. File / Module Change Map
| Module | File(s) | Change Type | Description |
|--------|---------|-------------|-------------|
|        |         |             |             |

## 5. Call Chain / Data Flow
<!-- Key call chains and data flows for the implementation -->

## 6. Technical Constraints
<!-- Platform, language, framework, or infrastructure constraints -->

## 7. Implementation Risk
| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
|      |        |            |            |

## 8. Evidence References
依据：
```

- [ ] **Step 4: Write templates/artifacts/test-design.md**

```markdown
# Test Design: {{TASK_ID}}

## 1. Test Strategy
<!-- Overall testing approach: unit, integration, e2e, manual -->

## 2. Acceptance Criteria
<!-- Verifiable conditions for feature acceptance -->

## 3. Test Scenarios
### Functional Tests
| ID | Scenario | Preconditions | Steps | Expected Result |
|----|----------|---------------|-------|-----------------|
|    |          |               |       |                 |

### Integration Tests
| ID | Scenario | Modules Involved | Steps | Expected Result |
|----|----------|-----------------|-------|-----------------|
|    |          |                 |       |                 |

### Edge Cases & Error Paths
| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
|    |          |                   |

## 4. Regression Scope
<!-- Existing functionality that needs regression testing -->

## 5. Test Data Requirements
<!-- Data setup needed for testing -->

## 6. Test Environment Requirements
<!-- Special environment configuration needed -->

## 7. Risks & Untestable Items
| Risk | Reason | Mitigation |
|------|--------|------------|
|      |        |            |

## 8. Evidence References
依据：
```

- [ ] **Step 5: Write templates/artifacts/integrated-design.md**

```markdown
# Integrated Design: {{TASK_ID}}

## 1. Design Summary
<!-- Executive summary of the complete design across all phases -->

## 2. Phase Design References
| Phase | Artifact | Status | Last Updated |
|-------|----------|--------|-------------|
| Business Design | artifacts/business-design.md | | |
| Solution Design | artifacts/solution-design.md | | |
| Implementation Design | artifacts/implementation-design.md | | |
| Test Design | artifacts/test-design.md | | |

## 3. Consistency Check
<!-- Cross-phase consistency verification results -->

### Business → Solution Alignment
<!-- Does the solution correctly implement business requirements? -->

### Solution → Implementation Alignment
<!-- Is the implementation design faithful to the solution architecture? -->

### Implementation → Test Alignment
<!-- Does the test design cover the implementation scope? -->

## 4. Cross-Phase Conflicts & Resolutions
| Conflict | Phases Involved | Resolution |
|----------|----------------|------------|
|          |                |            |

## 5. Accepted Risks Summary
<!-- Aggregate all accepted_risk from decision records -->
| Risk ID | Source Phase | Risk Description | Acceptance Rationale |
|---------|-------------|------------------|----------------------|
|         |             |                  |                      |

## 6. Scope Verification
<!-- Verify all in-scope items are covered by phase designs -->

## 7. Approvals Required
- [ ] All phase reviews passed (no blocking)
- [ ] All advisory items confirmed by human
- [ ] All accepted risks documented in decisions
```

- [ ] **Step 6: Write templates/reviews/review-template.md**

```markdown
# Review: {{ARTIFACT_NAME}} by {{REVIEWER}}

**Date:**
**Reviewer Role:** {{REVIEWER_ROLE}}
**Artifact:** {{ARTIFACT_PATH}}
**Review Type:** stage-review | integrated-review

## Review Summary
<!-- Overall assessment -->

## Blocking Issues
<!-- Issues that MUST be fixed before proceeding -->

### B-001: {{ISSUE_TITLE}}
- **Location:** {{SECTION_OR_LINE}}
- **Description:**
- **Expected Fix:**
- **Status:** open | fixed | verified

## Advisory Items
<!-- Suggestions that require human decision -->

### ADV-001: {{ADVICE_TITLE}}
- **Location:**
- **Suggestion:**
- **Rationale:**
- **Human Decision:** pending | apply | no_change | convert_to_blocking

## Risk Candidates
<!-- Potential risks identified during review -->

### RISK-001: {{RISK_TITLE}}
- **Description:**
- **Potential Impact:**
- **Suggested Mitigation:**
- **Human Decision:** pending | accepted_risk | mitigated | rejected

## Review Attestation
- [ ] All required sections of the artifact have been reviewed
- [ ] Blocking issues are clearly documented with expected fixes
- [ ] Advisory items include clear rationale for human decision
```

- [ ] **Step 7: Write remaining templates**

For `templates/approvals/approval-template.json`:
```json
{
  "approvalId": "APP-xxx",
  "type": "design-final-approval",
  "taskId": "FEAT-xxx",
  "approvedArtifacts": [],
  "approvedScope": [],
  "limitations": [],
  "approvedBy": "human",
  "approvedAt": ""
}
```

For `templates/verification/test-handoff-template.md`:
```markdown
# Test Handoff: {{TASK_ID}}

## 1. Verification Results
| Check | Command | Result | Notes |
|-------|---------|--------|-------|
|       |         |        |       |

## 2. Change Summary
<!-- Diff summary: modified files, change types -->

## 3. Impact Scope
<!-- Modules/components affected -->

## 4. Regression Suggestions
<!-- What existing functionality should be regression tested -->

## 5. Known Risks
<!-- Risks carried forward from design or discovered during implementation -->

## 6. Test Environment / Data Preparation
<!-- What testers need to set up -->

## 7. CI/CD Guidance (if applicable)
<!-- Pipeline, deployment, or environment notes for CIE -->
```

- [ ] **Step 8: Commit all templates**

```bash
git add templates/
git commit -m "feat: add artifact, review, approval, and verification templates"
```

---

## Phase 6: Core Skills — Workflow + Status

### Task 17: workflow/SKILL.md — Main Workflow Entry

**Files:**
- Create: `skills/workflow/SKILL.md`

**Integration Contract:**
- **Entry:** `/scc-dev-sphere:workflow`
- **Inputs:** Optional `$ARGUMENTS` (e.g., `list`, `switch <task-id>`)
- **Outputs:** nextAction displayed to user with guidance to execute the recommended agent/skill
- **Completion criteria:** nextAction computed, displayed to user

- [ ] **Step 1: Write skills/workflow/SKILL.md**

````markdown
---
name: workflow
description: Main workflow entry for scc-dev-sphere. Reads current task, computes next action, and guides agent/skill execution. Use to advance any active task.
---

# Workflow — Main Orchestrator Entry

You are the main workflow entry point for the scc-dev-sphere plugin. Your job is to read the current task state, compute the next legitimate action via the deterministic workflow resolver, and guide the user to execute it.

## Integration Contract

- **Entry:** `/scc-dev-sphere:workflow [list|switch <task-id>]`
- **Inputs:** Optional sub-action via `$ARGUMENTS`
- **Outputs:** nextAction displayed to user
- **Completion criteria:** nextAction computed and presented

## Execution Steps

### Step 1: Parse Arguments

Check `$ARGUMENTS`:
- `list` → List all tasks in `.devsphere/tasks/` and show their status
- `switch <task-id>` → Update `current-task.json` to point to the specified task
- (empty) → Compute next action for the current active task

### Step 2: If no active task

If `.devsphere/current-task.json` does not exist or has no `activeTaskId`, display:

```
No active task found. To create a feature task, use:
  /scc-dev-sphere:feature-init

To list existing tasks: /scc-dev-sphere:workflow list
To switch tasks: /scc-dev-sphere:workflow switch <task-id>
```

Stop here.

### Step 3: Compute nextAction

Run the deterministic workflow resolver:

```bash
node scripts/devsphere-workflow.js "<workspace-root>"
```

Replace `<workspace-root>` with the directory containing `.devsphere/`. The resolver will:
1. Read `.devsphere/current-task.json`
2. Identify `taskType`
3. Load the appropriate resolver (MVP: `scripts/workflows/feature-workflow.js`)
4. Output a `nextAction` JSON object to stdout

Parse the JSON output.

### Step 4: Present nextAction to User

Based on `nextAction.kind`:

#### `run_skill`
Display:
```
📋 **Next Action:** {nextAction.reason}

**Task:** {nextAction.taskId}
**Status:** {nextAction.status}
**Stage:** {nextAction.stage || 'N/A'}
**Target:** {nextAction.target || 'N/A'}

**Recommended Action:**
  Skill: /scc-dev-sphere:{nextAction.skill}
  Agent(s): {nextAction.agents.join(', ')}

**Required Artifacts:**
{nextAction.requiredArtifacts.map(a => '  - ' + a).join('\n')}

**Expected Outputs:**
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
⏸️ **Human Confirmation Required**

**Task:** {nextAction.taskId}
**Stage:** {nextAction.stage}
{pause.prompt if nextAction.pause}

Please respond to proceed.
```

Wait for the user's response before continuing.

#### `show_status`
Display the status information from `nextAction.reason`. Suggest checking `/scc-dev-sphere:status` for full details.

#### `blocked`
Display:
```
🚫 **Blocked**

{nextAction.reason}

To view full status: /scc-dev-sphere:status
```

#### `completed`
Display:
```
✅ **Task Complete**

{nextAction.reason}

To view full status: /scc-dev-sphere:status
```

### Step 5: After User Acts

After the user executes the recommended agent/skill, the corresponding skill will produce artifacts and update state. The next time `/scc-dev-sphere:workflow` is called, the resolver will compute the new next action based on updated state.

## Constraints

- Workflow does NOT execute agent/skill actions directly — it only recommends.
- Workflow does NOT modify state files — that is the responsibility of skills and hooks.
- Workflow always re-computes nextAction from current persistent state (no caching between calls).
````

- [ ] **Step 2: Commit**

```bash
git add skills/workflow/SKILL.md
git commit -m "feat: add workflow skill — main orchestration entry point"
```

---

### Task 18: status/SKILL.md — Status Display

**Files:**
- Create: `skills/status/SKILL.md`

- [ ] **Step 1: Write skills/status/SKILL.md**

````markdown
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
# 📊 Task Status: {taskId}

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
````

- [ ] **Step 2: Commit**

```bash
git add skills/status/SKILL.md
git commit -m "feat: add status skill — read-only task status display"
```

---

## Phase 7: Feature Pipeline Skills

### Task 19: feature-init/SKILL.md — Task Initialization

**Files:**
- Create: `skills/feature-init/SKILL.md`

- [ ] **Step 1: Write skills/feature-init/SKILL.md**

````markdown
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
````

- [ ] **Step 2: Commit**

```bash
git add skills/feature-init/SKILL.md
git commit -m "feat: add feature-init skill"
```

---

### Task 20: feature-assess/SKILL.md — Complexity Assessment

**Files:**
- Create: `skills/feature-assess/SKILL.md`

- [ ] **Step 1: Write skills/feature-assess/SKILL.md**

````markdown
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
````

- [ ] **Step 2: Commit**

```bash
git add skills/feature-assess/SKILL.md
git commit -m "feat: add feature-assess skill"
```

---

### Tasks 21-27: Remaining Feature Pipeline Skills

Due to the similarity in structure, I'll provide the complete SKILL.md for each remaining skill in a condensed but complete format.

- [ ] **Step 1: Write skills/feature-design/SKILL.md (Design Orchestrator)**

````markdown
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
````

- [ ] **Step 2: Write phase design skills (business, solution, implementation, test)**

Each phase design skill follows this template (shown for business; others are structurally identical with different agent assignments):

````markdown
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
````

The other three phase skills follow the same structure with:
- **feature-design-solution**: SE agent, produces `solution-design.md`, queries architecture specs
- **feature-design-implementation**: MDE agent, produces `implementation-design.md`, queries code repos
- **feature-design-test**: TSE agent, produces `test-design.md`, queries test standards

- [ ] **Step 3: Write skills/feature-review/SKILL.md**

````markdown
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
- **Completion criteria:** All blocking closed OR `state.json.designRevisionLimit` reached (default 25)

## Parameters

- `--target`: One of `business-design`, `solution-design`, `implementation-design`, `test-design`, `integrated-design`

## Execution

### Step 1: Determine Reviewers

Look up the base review matrix for the target artifact (spec section 9). Check if risk-enhanced reviewers are needed (CIE for deployment risk, etc.).

### Step 2: Run Parallel Reviews

For each required reviewer agent, load the agent with the `feature-review` skill context and the target artifact. Each agent reviews from their perspective and outputs:
- Blocking issues (must fix)
- Advisory items (suggestions for human decision)
- Risk candidates (potential risks for human acceptance)

### Step 3: Compile Review Results

Aggregate all review findings into:
- `reviews/<target>/<agent>-review.md` for each reviewer
- Update `review-matrix.json` with review status, blocking/advisory/risk counts

### Step 4: Revision Loop

If blocking > 0:
1. Return blocking issues to the original design agent.
2. Design agent revises the artifact.
3. Original reviewers re-verify their blocking issues.
4. Repeat until blocking=0 or `state.json.designRevisionLimit` is reached (default 25).

### Step 5: Advisory Compilation

When blocking=0:
1. Compile all advisory items into checklist.
2. Write `reviews/advisory-confirmation.json` with pending advisory items.
3. Present advisory checklist to user for human decision (`apply` / `no_change` / `convert_to_blocking`).

### Step 6: Update State

- If blocking=0: update `stages.<phase>.status = 'ai_review_passed'`.
- For integrated review: check if all phases reach required state → if yes, can advance to `design_ready`.

## Exit Conditions

- All blocking closed → success.
- Max 3 revision rounds → partial, flag unresolved blocking for human.
- Irresolvable agent conflicts → flag for human decision.
- Human info/decision needed → pause and request input.
````

- [ ] **Step 4: Write skills/feature-approve/SKILL.md**

````markdown
---
name: feature-approve
description: Execute final design approval. Validates design_ready preconditions, generates design-final-approval.json, advances status to approved_for_implementation. HIGH-RISK: requires human confirmation gate.
---

# Feature Approve — Final Design Approval

Generate the final design approval. This is a HIGH-RISK skill with a mandatory human confirmation gate.

## Integration Contract

- **Entry:** `/scc-dev-sphere:feature-approve`
- **Inputs:** State at `design_ready`, all design artifacts, review matrix
- **Outputs:** `approvals/design-final-approval.json`, `status = approved_for_implementation`
- **Completion criteria:** Approval record written, status updated

## Precondition Checks (HARD GATE)

Before proceeding, verify ALL of:
1. `state.status === 'design_ready'`
2. All `blocking` issues closed in review matrix
3. All `advisory` items have human confirmation in `reviews/advisory-confirmation.json`
4. All `accepted_risk` items are in `decisions/*-decisions.md`
5. `integrated-design.md` includes accepted risk summary

If ANY precondition fails, STOP and display which conditions are not met.

## Human Confirmation Gate (MANDATORY)

Display the approval summary:

```
⚠️ **FINAL DESIGN APPROVAL**

**Task:** {taskId}
**Artifacts to Approve:**
  - business-design.md (hash: {hash})
  - solution-design.md (hash: {hash})
  - implementation-design.md (hash: {hash})
  - test-design.md (hash: {hash})
  - integrated-design.md (hash: {hash})

**Scope:** {approvedScope}

**Accepted Risks:** {count} risks accepted
{list each risk with brief description}

**Limitations:** {limitations}

Do you approve this design for code implementation?
(Type YES to approve, or describe concerns)
```

Wait for explicit human "YES" before proceeding. "OK" or "looks good" without explicit approval intent is NOT sufficient — ask for a clear "YES".

## After Approval

1. Generate `approvals/design-final-approval.json` with:
   - approvalId (APP-xxx), type, taskId
   - All approved artifact paths with content hashes
   - Approved scope, limitations
   - approvedBy: "human", approvedAt: timestamp

2. Update `state.status = 'approved_for_implementation'`.

3. Display:
```
✅ Design approved for implementation.

**Next Step:** /scc-dev-sphere:workflow
  → Will guide you through implementation planning.
```
````

- [ ] **Step 5: Write skills/feature-plan-implementation/SKILL.md**

````markdown
---
name: feature-plan-implementation
description: Generate implementation plan after design approval. DEV agent produces implementation-plan.md with repo binding, file changes, step sequence, test commands, and risk controls.
---

# Feature Plan Implementation — Generate Implementation Plan

Generate the development execution plan. This bridges design and code implementation.

## Integration Contract

- **Entry:** `/scc-dev-sphere:feature-plan-implementation`
- **Inputs:** Approved design artifacts, code repository access
- **Outputs:** `implementation/implementation-plan.md`, repo binding in `links/repos.json`
- **Completion criteria:** Implementation plan generated, status advanced

## Execution

1. Load the DEV agent.
2. If repos not yet bound, ask user to specify target code repositories. Write to `links/repos.json`.
3. DEV agent queries code repositories for module structure, existing patterns, test commands.
4. Generate `implementation/implementation-plan.md` including:
   - Associated repos
   - Expected module/file changes
   - Implementation step sequence
   - Test and verification commands
   - Rollback/recovery strategy
   - Risk points and controls
   - Whether CIE involvement is needed

5. Save repository evidence to `evidence/repository/`.

## Human Confirmation (High-Risk or Strict Mode)

If `workflowMode === 'strict-human-loop'` or task has high risk:
1. Present the implementation plan for review.
2. Wait for human confirmation.
3. Generate `approvals/implementation-plan-approval.json`.

## State Update

- Normal tasks: `status = 'implementation_planned'`
- High-risk/strict: Only after `implementation-plan-approval.json` is generated
````

- [ ] **Step 6: Write skills/feature-implement/SKILL.md**

````markdown
---
name: feature-implement
description: Execute code implementation. First code change requires human confirmation. Generates diff summary before completion. HIGH-RISK: requires human confirmation gate for first code change.
---

# Feature Implement — Code Implementation

Execute code changes based on the implementation plan. HIGH-RISK skill with mandatory human confirmation before first code change.

## Integration Contract

- **Entry:** `/scc-dev-sphere:feature-implement`
- **Inputs:** Implementation plan, repo binding, design artifacts
- **Outputs:** Code changes, `implementation/implementation-log.md`, diff summary
- **Completion criteria:** Code changes complete, diff summary generated, status → verification_ready

## Precondition Check

Verify `state.status` is `implementation_planned` or `implementing`. If NOT, STOP and direct user to complete prior phases.

## First Code Change Gate (MANDATORY)

If `status === 'implementation_planned'` (first code change):

Display:
```
🔨 **Code Implementation Starting**

**Task:** {taskId}
**Target Repo(s):** {list repos and branches}
**Expected Changes:** {summary from implementation plan}
**Verification Commands:** {test commands}
**Key Risks:** {risk summary}

Proceed with code changes? (Type YES to begin)
```

Wait for explicit human "YES". Record confirmation in `implementation/implementation-log.md`.

After confirmation: update `status = 'implementing'`.

## Implementation

1. Execute code changes following the implementation plan.
2. Run test/verification commands.
3. Fix any issues discovered during testing.
4. If scope deviation is detected (changes beyond implementation plan):
   - Record deviation in implementation log.
   - Present deviation summary to user for confirmation.
   - Do NOT auto-revert; just flag for awareness.

## Before Declaring Complete

Generate diff summary:
```bash
git diff --stat
```
Document:
- Modified file list
- Change type summary (new, modified, deleted)
- Alignment with implementation plan
- Notable scope deviations

Write diff summary to `implementation/implementation-log.md`.

If significant scope deviations exist, present to user for confirmation before proceeding.

## State Update

When code changes are complete and verified locally:
- Update `status = 'verification_ready'`.
- Display: "Code implementation complete. Use /scc-dev-sphere:workflow for verification."
````

- [ ] **Step 7: Write skills/feature-verify/SKILL.md**

````markdown
---
name: feature-verify
description: Run local verification and generate test handoff package. Only skill that can set status=completed. Consumes verification_ready gate.
---

# Feature Verify — Verification & Test Handoff

Run local verification and produce the test handoff package. This is the final step before task completion.

## Integration Contract

- **Entry:** `/scc-dev-sphere:feature-verify`
- **Inputs:** Code changes, implementation log, test design
- **Outputs:** `verification/test-handoff.md`, status update
- **Completion criteria:** Test handoff package generated

## Precondition

Verify `state.status === 'verification_ready'`. If not, direct to complete implementation first.

## Execution

1. Run local verification (tests, linting, build checks as specified in implementation plan).
2. Compile results:
   - Passed checks with commands
   - Failed checks with details
   - Untested items with reasons

3. Generate `verification/test-handoff.md` including:
   - Local verification results
   - Commands executed
   - Untested items and reasons
   - Code change summary (from implementation log)
   - Impact scope
   - Regression suggestions
   - Known risks (from accepted_risk)
   - Test environment/data preparation suggestions
   - CI/CD guidance if CIE was involved

## Result Handling

- **All pass + handoff generated:** Update `status = 'completed'`.
- **Failures but fixable:** Update `status = 'implementing'`, return to implementation.
- **Failures, unrecoverable:** Update `status = 'blocked'`, document blocking reason.

## Completion

Display completion summary and confirm the test handoff package is ready for the testing team.
````

- [ ] **Step 8: Commit all feature pipeline skills**

```bash
git add skills/feature-design/SKILL.md \
        skills/feature-design-business/SKILL.md \
        skills/feature-design-solution/SKILL.md \
        skills/feature-design-implementation/SKILL.md \
        skills/feature-design-test/SKILL.md \
        skills/feature-review/SKILL.md \
        skills/feature-approve/SKILL.md \
        skills/feature-plan-implementation/SKILL.md \
        skills/feature-implement/SKILL.md \
        skills/feature-verify/SKILL.md
git commit -m "feat: add all feature pipeline skills (design phases, review, approve, plan, implement, verify)"
```

---

## Phase 8: Supplementary Skills

### Tasks 31-33: knowledge-query + Dev Specialized Skills

- [ ] **Step 1: Write skills/knowledge-query/SKILL.md**

````markdown
---
name: knowledge-query
description: Query private knowledge base via MCP tools. Handles query strategy, evidence filtering, citation standards, and evidence insufficiency judgment.
---

# Knowledge Query — Knowledge Base Access

Query the private knowledge base through MCP tools and manage evidence collection. This skill is used by all agents (SA, SE, MDE, DEV, TSE) during their respective phases.

## Integration Contract

- **Entry:** `/scc-dev-sphere:knowledge-query`
- **Inputs:** Query intent from the calling agent
- **Outputs:** Structured search results, evidence snapshots saved to `evidence/knowledge/`
- **Completion criteria:** Query results returned, evidence snapshots saved (if results adopted into artifacts)

## Execution

### Step 1: Understand Query Intent

The calling agent specifies:
- What they need to find (business rules, architecture specs, code patterns, test standards, etc.)
- Why they need it (which artifact/decision it supports)
- Required confidence level

### Step 2: Execute MCP Query

Use available MCP knowledge base tools to search. Try multiple query formulations if initial results are insufficient.

### Step 3: Evaluate Results

For each result, assess:
- Relevance to the query intent
- Source reliability and currency
- Whether it's sufficient or additional queries are needed

### Step 4: Save Evidence

For results that WILL BE USED in design artifacts:
1. Assign an evidence ID (EV-xxx).
2. Save a snapshot to `evidence/knowledge/EV-xxx-<descriptive-name>.md`:
   ```markdown
   # EV-xxx: {title}
   - **Source:** {knowledge base identifier}
   - **Query:** {query used}
   - **Retrieved:** {timestamp}
   - **Relevance:** {why this was retrieved}
   - **Content Summary:**
   {key findings, not full dump}
   ```
3. Update `evidence/evidence-registry.json` with the new entry.

### Step 5: Flag Evidence Gaps

If expected information cannot be found:
- Record the gap in the evidence registry with `confidence: "low"` or `status: "not_found"`.
- Report to the calling agent so they can mark assumptions or flag for human clarification.
````

- [ ] **Step 2: Write skills/backend-development/SKILL.md**

````markdown
---
name: backend-development
description: Backend development context — APIs, services, data access, jobs, configuration changes. Use when implementation impacts backend code.
---

# Backend Development

Specialized context for backend development tasks. Loaded by the DEV agent when implementation plan identifies backend impact.

## Focus Areas

- API endpoint implementation and modification
- Service layer logic and orchestration
- Data access layer (ORM, queries, migrations)
- Background jobs and task scheduling
- Configuration and environment management
- Backend testing (unit, integration, API tests)

## Execution Guidelines

1. Follow existing backend patterns and conventions in the codebase.
2. Ensure API contracts match the solution design specifications.
3. Validate all inputs at API boundaries; return structured error responses following the project's error format.
4. Add structured logging at service entry/exit points and for all error paths.
5. Write/update unit tests for all new/modified service methods; add integration tests for new API endpoints.
6. Document any new environment variables in the implementation log.

## Constraints

- Do NOT modify frontend code.
- Do NOT change existing API response formats without recording a compatibility decision.
- Reference the solution design's API contracts for interface specifications.
````

- [ ] **Step 3: Write skills/frontend-development/SKILL.md**

````markdown
---
name: frontend-development
description: Frontend development context — pages, components, interactions, state management, API adaptation. Use when implementation impacts frontend code.
---

# Frontend Development

Specialized context for frontend development tasks. Loaded by the DEV agent when implementation plan identifies frontend impact.

## Focus Areas

- Page and component implementation/modification
- User interaction flows and event handling
- Client-side state management
- API request/response adaptation and error handling
- UI styling following project conventions
- Frontend testing (component tests, interaction tests)

## Execution Guidelines

1. Follow existing frontend patterns (component structure, styling approach, state management) in the codebase.
2. Ensure API calls match the solution design's interface contracts — verify request/response shapes.
3. Handle loading, empty, and error states for every data-fetching component.
4. Write component tests for new/modified components; add interaction tests for user flows.
5. Document any new UI dependencies or component library additions.

## Constraints

- Do NOT modify backend code.
- Do NOT change API contracts — flag mismatches with the solution design for review.
- Maintain existing UI patterns unless the design explicitly specifies changes.
````

- [ ] **Step 4: Write skills/fullstack-change-planning/SKILL.md**

````markdown
---
name: fullstack-change-planning
description: Fullstack change coordination — cross-stack planning, interface contract verification, integration order. Use when implementation spans both frontend and backend.
---

# Fullstack Change Planning

Specialized context for coordinating changes that span both frontend and backend. Loaded by the DEV agent when the implementation plan identifies cross-stack impact.

## Focus Areas

- Interface contract verification between frontend and backend
- Change sequencing and dependency ordering
- Integration point identification and testing
- API versioning and backward compatibility
- Coordinated rollback planning

## Execution Guidelines

1. Map all integration points between frontend and backend changes.
2. Define the change order: which side changes first, how the other adapts.
3. Verify API contracts are consistent between the solution design, backend implementation, and frontend consumption.
4. Plan integration testing: what tests verify the full stack works together.
5. Identify deployment coupling: can frontend and backend deploy independently, or must they be coordinated.

## Constraints

- Do NOT implement changes directly — this skill provides planning context only.
- Flag any API contract ambiguities between frontend and backend before implementation begins.
- Document the integration test plan in the implementation plan.
````

- [ ] **Step 5: Commit supplementary skills**

```bash
git add skills/knowledge-query/SKILL.md \
        skills/backend-development/SKILL.md \
        skills/frontend-development/SKILL.md \
        skills/fullstack-change-planning/SKILL.md
git commit -m "feat: add supplementary skills (knowledge-query, backend, frontend, fullstack)"
```

---

## Phase 9: Integration Validation

### Task 34: End-to-End Validation

- [ ] **Step 1: Verify complete plugin structure**

```bash
cd /Users/xiaobo/Documents/Projects/scc-dev-sphere
find . -name '*.md' -o -name '*.json' -o -name '*.js' | grep -v node_modules | grep -v .git | sort
```
Expected: All files from the File Structure Map exist.

- [ ] **Step 2: Verify all JSON is valid**

```bash
for f in $(find . -name '*.json' -not -path './node_modules/*' -not -path './.git/*'); do
  echo -n "$f: "
  node -e "require('$f')" && echo "OK" || echo "INVALID"
done
```

- [ ] **Step 3: Verify all Node.js scripts load**

```bash
for f in scripts/*.js scripts/workflows/*.js; do
  echo -n "$f: "
  node -e "require('./$f')" && echo "OK" || echo "FAIL"
done
```

- [ ] **Step 4: Verify all SKILL.md files have YAML frontmatter**

```bash
for f in skills/*/SKILL.md; do
  has_frontmatter=$(head -1 "$f" | grep -c '^---$')
  echo "$f: frontmatter=$has_frontmatter"
done
```

- [ ] **Step 5: Verify all agent files have YAML frontmatter**

```bash
for f in agents/*.md; do
  has_frontmatter=$(head -1 "$f" | grep -c '^---$')
  echo "$f: frontmatter=$has_frontmatter"
done
```

- [ ] **Step 6: Commit validation results**

```bash
git add -A
git commit -m "chore: integration validation — verify all files, JSON validity, script loading"
```

---

## Implementation Order Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1 | Plugin scaffold & manifest |
| 2 | 2-8 | Scripts (state, workspace, review-matrix, approval, guard, workflow, feature-resolver) |
| 3 | 9-14 | Agent definitions (SA, SE, MDE, DEV, TSE, CIE) |
| 4 | 15 | Hooks configuration |
| 5 | 16 | Templates (artifacts, reviews, approvals, verification) |
| 6 | 17-18 | Core skills (workflow, status) |
| 7 | 19-30 | Feature pipeline skills (init through verify) |
| 8 | 31-33 | Supplementary skills (knowledge-query, dev specialized) |
| 9 | 34 | Integration validation |

**Total: 34 tasks across 9 phases.**
