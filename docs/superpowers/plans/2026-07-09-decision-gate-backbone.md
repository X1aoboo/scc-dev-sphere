# 设计阶段决策门骨干 (Decision-Gate Backbone) — Plan A

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为设计阶段「过程内人工决策循环」提供确定性、可测试的机器层骨干——decisions 文件 CRUD、PreToolUse 守卫、resolver 决策动作、sync 防错、模板与 hooks 接线——使 gated 决策未全部 resolved 时，主产物物理上无法被写出/被当成 drafted。

**Architecture:** 沿用插件现有「无状态 resolver + 持久化事实驱动 + 一个 script 一种产物」的模式（对标 `devsphere-review-matrix.js`）。新增 `devsphere-decisions.js` 管 `decisions/<slug>-decisions.json`；`devsphere-guard.js` 增 PreToolUse 守卫读 stdin 拦截主产物写入；`feature-workflow.js` 增 `design-stage-action` 确定性路由 + sync-stage-status 防错。不加状态枚举（§4），决策门纯靠 decisions 文件内容驱动。

**Tech Stack:** Node.js (CommonJS)，无依赖。测试用 Node 内置 `node:test` + `node:assert`（`node --test`，需 Node ≥ 18）。Claude Code hooks：PreToolUse stdin JSON + `hookSpecificOutput.permissionDecision`。

## Global Constraints

- 不新增 npm 依赖、不新增 package.json、不新增构建步骤。脚本是 CommonJS（`require`/`module.exports`），CLI 与 `require()` 双用途。
- decisions 文件路径：`decisions/<artifact-slug>-decisions.json`，slug 与 review-matrix 一致：`business-design` / `solution-design` / `implementation-design` / `test-design`。
- 决策 ID 前缀按 slug：`business-design→BD`、`solution-design→SD`、`implementation-design→ID`、`test-design→TD`，格式 `<PREFIX>-DEC-NNN`（三位补零）。
- 不修改 state.json 的 status 枚举；不在 state.json 里存决策 resolved 派生状态（resolver 直接读 decisions 文件）。
- 所有 CLI 错误走 `process.stderr.write + process.exit(1)`，正常输出走 `process.stdout.write(JSON.stringify(...))`，与现有脚本一致。
- 测试不得污染真实工作区：用 `os.tmpdir()` 建临时任务目录。

## Spec 覆盖映射（本 Plan A 只覆盖确定性机器层）

| Spec 节 | 由本 Plan 覆盖 | 留给 Plan B（skill/agent 采纳） |
|---|---|---|
| §4 派发表 | Task 4 `design-stage-action` | feature-design skill 调用它 |
| §4.4 PreToolUse 守卫 | Task 3 | — |
| §4.4 sync 防错 | Task 5 | — |
| §5 decisions 文件结构 | Task 1 + Task 6 模板 | skill/agent 读写它 |
| §3 编排循环 | — | workflow/feature-design skill 编排 |
| §6 模式差异化 | Task 4 只读 `state.workflowMode` 做信息暴露 | skill 按模式决定是否进决策循环 |
| §7 agents/skills/interaction-guidelines | — | Plan B 全部 |

---

## File Structure

| 文件 | 责任 | 任务 |
|---|---|---|
| `scripts/devsphere-decisions.js` (新建) | decisions 文件 CRUD + CLI | Task 1 |
| `scripts/test/helpers.js` (新建) | 测试用临时任务工作区工厂 | Task 1 |
| `scripts/test/devsphere-decisions.test.js` (新建) | decisions CRUD 测试 | Task 1 |
| `scripts/devsphere-guard.js` (改) | 新增 `check-decisions-resolved`（PreToolUse stdin） | Task 3 |
| `scripts/test/devsphere-guard-decisions.test.js` (新建) | 守卫测试 | Task 3 |
| `scripts/workflows/feature-workflow.js` (改) | 新增 `design-stage-action` 命令 + sync-stage-status 防错 | Task 4, Task 5 |
| `scripts/test/feature-workflow-decisions.test.js` (新建) | resolver 决策动作 + sync 防错测试 | Task 4, Task 5 |
| `templates/decisions/stage-decisions-template.json` (新建) | decisions 文件模板 | Task 6 |
| `hooks/hooks.json` (改) | 接入 PreToolUse 守卫 | Task 6 |

---

## Task 1: decisions 文件 CRUD 与 CLI (`devsphere-decisions.js`)

对标 `devsphere-review-matrix.js` 的结构（常量 → 读/写 → 业务函数 → CLI → module.exports）。

**Files:**
- Create: `scripts/devsphere-decisions.js`
- Create: `scripts/test/helpers.js`
- Create: `scripts/test/devsphere-decisions.test.js`

**Interfaces:**
- Consumes: `devsphere-state.js` 的 `readJSON`/`writeJSON`（已存在）。
- Produces（导出，后续 Task 依赖这些确切签名）:
  - `readDecisions(taskPath, slug) → object|null`
  - `writeDecisions(taskPath, slug, data) → void`
  - `initDecisions(taskPath, slug, taskId, stageName) → object`（返回新建文件内容）
  - `addDecision(taskPath, slug, input) → object`（input: `{type, category, summary, rationale?, options?, recommendation?, askMode?, evidence?, impact?}`）
  - `resolveDecision(taskPath, slug, decisionId, resolution) → object`（resolution: `{chosen, note?, decidedAt}`）
  - `listGatedPending(taskPath, slug) → array`
  - `countGatedPending(taskPath, slug) → number`
  - `SLUG_PREFIX` map、`DECISIONS_DIR='decisions'`、`VALID_TYPES=['gated','autonomous']`、`VALID_CATEGORIES=[...]`

- [ ] **Step 1: 写测试 helper `scripts/test/helpers.js`**

```javascript
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createFeatureTask } = require('../devsphere-workspace');

// 建一个临时任务工作区，返回 { workspaceRoot, taskPath, taskId }
function makeTask(opts = {}) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-test-'));
  const taskId = opts.taskId || 'FEAT-TEST-001';
  createFeatureTask(workspaceRoot, taskId, { workflowMode: opts.workflowMode || 'strict-human-loop' });
  const taskPath = path.join(workspaceRoot, '.devsphere', 'tasks', 'feature', taskId);
  return { workspaceRoot, taskPath, taskId };
}

module.exports = { makeTask };
```

- [ ] **Step 2: 写失败测试 `scripts/test/devsphere-decisions.test.js`**

```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { makeTask } = require('./helpers');
const {
  initDecisions, readDecisions, addDecision, resolveDecision,
  listGatedPending, countGatedPending, SLUG_PREFIX,
} = require('../devsphere-decisions');

test('initDecisions 创建空 decisions 文件', () => {
  const { taskPath, taskId } = makeTask();
  const data = initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  assert.strictEqual(data.stage, 'businessDesign');
  assert.deepStrictEqual(data.decisions, []);
  assert.ok(fs.existsSync(path.join(taskPath, 'decisions', 'business-design-decisions.json')));
});

test('addDecision 为 gated 项分配 BD-DEC-001 并落盘', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  const d = addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope',
    summary: '是否需要注册登录？',
    options: [{ label: '需要', description: 'x' }, { label: '不需要', description: 'y' }],
    askMode: 'single_select', recommendation: '需要',
  });
  assert.strictEqual(d.id, 'BD-DEC-001');
  assert.strictEqual(d.status, 'pending');
  const persisted = readDecisions(taskPath, 'business-design');
  assert.strictEqual(persisted.decisions.length, 1);
});

test('addDecision 自增 ID 与 autonomous 类型', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', { type: 'gated', category: 'feature_scope', summary: 'a' });
  addDecision(taskPath, 'business-design', { type: 'autonomous', category: 'tradeoff', summary: 'b' });
  const persisted = readDecisions(taskPath, 'business-design');
  assert.strictEqual(persisted.decisions[0].id, 'BD-DEC-001');
  assert.strictEqual(persisted.decisions[1].id, 'BD-DEC-002');
});

test('addDecision 拒绝非法 type', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  assert.throws(() => addDecision(taskPath, 'business-design', { type: 'bogus', category: 'feature_scope', summary: 'x' }));
});

test('resolveDecision 置 decided 并记 resolution', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', { type: 'gated', category: 'feature_scope', summary: 'q' });
  const r = resolveDecision(taskPath, 'business-design', 'BD-DEC-001', { chosen: '需要', note: 'ok', decidedAt: '2026-07-09T00:00:00Z' });
  assert.strictEqual(r.status, 'decided');
  assert.strictEqual(r.resolution.chosen, '需要');
});

test('countGatedPending 只数 gated+pending', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', { type: 'gated', category: 'feature_scope', summary: 'g1' });
  addDecision(taskPath, 'business-design', { type: 'gated', category: 'assumption', summary: 'g2' });
  addDecision(taskPath, 'business-design', { type: 'autonomous', category: 'tradeoff', summary: 'a1' });
  assert.strictEqual(countGatedPending(taskPath, 'business-design'), 2);
  resolveDecision(taskPath, 'business-design', 'BD-DEC-001', { chosen: 'x', decidedAt: 't' });
  assert.strictEqual(countGatedPending(taskPath, 'business-design'), 1);
  assert.strictEqual(listGatedPending(taskPath, 'business-design').length, 1);
});

test('SLUG_PREFIX 映射四个设计阶段', () => {
  assert.strictEqual(SLUG_PREFIX['business-design'], 'BD');
  assert.strictEqual(SLUG_PREFIX['solution-design'], 'SD');
  assert.strictEqual(SLUG_PREFIX['implementation-design'], 'ID');
  assert.strictEqual(SLUG_PREFIX['test-design'], 'TD');
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `node --test scripts/test/devsphere-decisions.test.js`
Expected: FAIL（`Cannot find module '../devsphere-decisions'`）

- [ ] **Step 4: 实现 `scripts/devsphere-decisions.js`**

```javascript
#!/usr/bin/env node
'use strict';

const path = require('path');
const { readJSON, writeJSON } = require('./devsphere-state');

const DECISIONS_DIR = 'decisions';
const SLUG_PREFIX = {
  'business-design': 'BD',
  'solution-design': 'SD',
  'implementation-design': 'ID',
  'test-design': 'TD',
};
const VALID_TYPES = ['gated', 'autonomous'];
const VALID_CATEGORIES = ['feature_scope', 'assumption', 'open_question', 'business_rule', 'tradeoff'];
const VALID_ASK_MODES = ['single_select', 'multi_select', 'confirm_gate'];

function decisionsPath(taskPath, slug) {
  return path.join(taskPath, DECISIONS_DIR, `${slug}-decisions.json`);
}

function readDecisions(taskPath, slug) {
  return readJSON(decisionsPath(taskPath, slug));
}

function writeDecisions(taskPath, slug, data) {
  writeJSON(decisionsPath(taskPath, slug), data);
}

function initDecisions(taskPath, slug, taskId, stageName) {
  const data = { stage: stageName, taskId, decisions: [] };
  writeDecisions(taskPath, slug, data);
  return data;
}

function nextDecisionId(decisions, slug) {
  const prefix = SLUG_PREFIX[slug];
  if (!prefix) throw new Error(`Unknown slug: ${slug}`);
  let max = 0;
  for (const d of decisions) {
    const m = typeof d.id === 'string' ? d.id.match(/-(\d+)$/) : null;
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-DEC-${String(max + 1).padStart(3, '0')}`;
}

function addDecision(taskPath, slug, input) {
  if (!input || !VALID_TYPES.includes(input.type)) {
    throw new Error(`Invalid decision type: ${input && input.type}`);
  }
  if (!input.category || !VALID_CATEGORIES.includes(input.category)) {
    throw new Error(`Invalid category: ${input.category}`);
  }
  if (input.type === 'gated') {
    if (!Array.isArray(input.options) || input.options.length < 2 || input.options.length > 4) {
      throw new Error('gated decision requires 2-4 options');
    }
    if (!VALID_ASK_MODES.includes(input.askMode)) {
      throw new Error(`Invalid askMode: ${input.askMode}`);
    }
  }
  const data = readDecisions(taskPath, slug);
  if (!data) throw new Error(`Decisions file not initialized for ${slug}`);
  const decision = {
    id: nextDecisionId(data.decisions, slug),
    type: input.type,
    category: input.category,
    summary: input.summary,
    rationale: input.rationale || '',
    options: input.type === 'gated' ? input.options : [],
    recommendation: input.recommendation || '',
    askMode: input.type === 'gated' ? input.askMode : null,
    status: 'pending',
    resolution: null,
    evidence: input.evidence || [],
    impact: input.impact || '',
  };
  data.decisions.push(decision);
  writeDecisions(taskPath, slug, data);
  return decision;
}

function resolveDecision(taskPath, slug, decisionId, resolution) {
  const data = readDecisions(taskPath, slug);
  if (!data) throw new Error(`Decisions file not initialized for ${slug}`);
  const d = data.decisions.find(x => x.id === decisionId);
  if (!d) throw new Error(`Decision not found: ${decisionId}`);
  if (!resolution || typeof resolution.chosen !== 'string') {
    throw new Error('resolution.chosen required');
  }
  d.status = 'decided';
  d.resolution = {
    chosen: resolution.chosen,
    note: resolution.note || '',
    decidedAt: resolution.decidedAt || new Date().toISOString(),
  };
  writeDecisions(taskPath, slug, data);
  return d;
}

function listGatedPending(taskPath, slug) {
  const data = readDecisions(taskPath, slug);
  if (!data) return [];
  return data.decisions.filter(d => d.type === 'gated' && d.status === 'pending');
}

function countGatedPending(taskPath, slug) {
  return listGatedPending(taskPath, slug).length;
}

// --- CLI ---

function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  try {
    switch (command) {
      case 'init': {
        const [taskPath, slug, taskId, stageName] = args.slice(1);
        process.stdout.write(JSON.stringify(initDecisions(taskPath, slug, taskId, stageName)));
        break;
      }
      case 'read': {
        process.stdout.write(JSON.stringify(readDecisions(args[1], args[2])));
        break;
      }
      case 'add': {
        let input;
        try { input = JSON.parse(args[3]); } catch (e) { throw new Error(`Invalid decision JSON: ${e.message}`); }
        process.stdout.write(JSON.stringify(addDecision(args[1], args[2], input)));
        break;
      }
      case 'resolve': {
        let resolution;
        try { resolution = JSON.parse(args[4]); } catch (e) { throw new Error(`Invalid resolution JSON: ${e.message}`); }
        process.stdout.write(JSON.stringify(resolveDecision(args[1], args[2], args[3], resolution)));
        break;
      }
      case 'count-gated-pending': {
        process.stdout.write(JSON.stringify({ count: countGatedPending(args[1], args[2]) }));
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
  DECISIONS_DIR, SLUG_PREFIX, VALID_TYPES, VALID_CATEGORIES, VALID_ASK_MODES,
  decisionsPath, readDecisions, writeDecisions, initDecisions,
  addDecision, resolveDecision, listGatedPending, countGatedPending,
};
```

- [ ] **Step 5: 运行测试确认通过**

Run: `node --test scripts/test/devsphere-decisions.test.js`
Expected: PASS（7 tests）

- [ ] **Step 6: 手动验证 CLI**

Run:
```bash
T=$(mktemp -d) && node scripts/devsphere-workspace.js create-feature-task "$T" FEAT-X strict-human-loop
TP="$T/.devsphere/tasks/feature/FEAT-X"
node scripts/devsphere-decisions.js init "$TP" business-design FEAT-X businessDesign
node scripts/devsphere-decisions.js add "$TP" business-design '{"type":"gated","category":"feature_scope","summary":"注册登录?","options":[{"label":"需要","description":"x"},{"label":"不需要","description":"y"}],"askMode":"single_select","recommendation":"需要"}'
node scripts/devsphere-decisions.js count-gated-pending "$TP" business-design
```
Expected: 末条输出 `{"count":1}`

- [ ] **Step 7: 提交**

```bash
git add scripts/devsphere-decisions.js scripts/test/helpers.js scripts/test/devsphere-decisions.test.js
git commit -m "feat(decisions): add decisions-file CRUD and CLI"
```

---

## Task 2: 决策门路径解析 helper（守卫与 resolver 共用）

把「绝对 file_path → (是否主产物, taskPath, slug)」的判定抽成纯函数，放 `devsphere-decisions.js`，供守卫与 resolver 复用，单独可测。

**Files:**
- Modify: `scripts/devsphere-decisions.js`（新增 `resolveMainArtifact(filePath)` + 导出）
- Create: `scripts/test/devsphere-decisions-resolve.test.js`

**Interfaces:**
- Produces: `resolveMainArtifact(filePath) → {isMainArtifact:boolean, taskPath?:string, slug?:string}`

- [ ] **Step 1: 写失败测试 `scripts/test/devsphere-decisions-resolve.test.js`**

```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { resolveMainArtifact } = require('../devsphere-decisions');

test('主产物路径解析出 taskPath 与 slug', () => {
  const r = resolveMainArtifact('/tmp/x/.devsphere/tasks/feature/FEAT-1/artifacts/business-design.md');
  assert.strictEqual(r.isMainArtifact, true);
  assert.strictEqual(r.slug, 'business-design');
  assert.strictEqual(r.taskPath, '/tmp/x/.devsphere/tasks/feature/FEAT-1');
});

test('四个设计阶段主产物都能解析', () => {
  for (const slug of ['business-design', 'solution-design', 'implementation-design', 'test-design']) {
    const r = resolveMainArtifact(`/p/t/artifacts/${slug}.md`);
    assert.strictEqual(r.isMainArtifact, true);
    assert.strictEqual(r.slug, slug);
    assert.strictEqual(r.taskPath, '/p/t');
  }
});

test('非主产物返回 isMainArtifact=false', () => {
  assert.strictEqual(resolveMainArtifact('/p/t/decisions/business-design-decisions.json').isMainArtifact, false);
  assert.strictEqual(resolveMainArtifact('/p/t/artifacts/integrated-design.md').isMainArtifact, false);
  assert.strictEqual(resolveMainArtifact('/p/t/inputs/requirement.md').isMainArtifact, false);
  assert.strictEqual(resolveMainArtifact('/unrelated/file.txt').isMainArtifact, false);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test scripts/test/devsphere-decisions-resolve.test.js`
Expected: FAIL（`resolveMainArtifact is not a function`）

- [ ] **Step 3: 在 `devsphere-decisions.js` 实现 `resolveMainArtifact`**

在 `countGatedPending` 之后、`// --- CLI ---` 之前插入：

```javascript
const MAIN_ARTIFACT_FILES = {
  'business-design.md': 'business-design',
  'solution-design.md': 'solution-design',
  'implementation-design.md': 'implementation-design',
  'test-design.md': 'test-design',
};

// 给定 Write/Edit 的绝对 file_path，判断是否为某设计阶段主产物；
// 若是，返回 {isMainArtifact:true, taskPath, slug}。taskPath = 主产物所在 artifacts 目录的父目录。
function resolveMainArtifact(filePath) {
  if (typeof filePath !== 'string') return { isMainArtifact: false };
  const norm = filePath.replace(/\\/g, '/');
  const parts = norm.split('/');
  const fileName = parts[parts.length - 1];
  const slug = MAIN_ARTIFACT_FILES[fileName];
  if (!slug) return { isMainArtifact: false };
  // parts: [..., '<taskPath>', 'artifacts', '<file>']
  if (parts[parts.length - 2] !== 'artifacts') return { isMainArtifact: false };
  const taskPath = parts.slice(0, -2).join('/');
  if (!taskPath) return { isMainArtifact: false };
  return { isMainArtifact: true, taskPath, slug };
}
```

并在 `module.exports` 增加 `resolveMainArtifact, MAIN_ARTIFACT_FILES`。

- [ ] **Step 4: 运行确认通过**

Run: `node --test scripts/test/devsphere-decisions-resolve.test.js`
Expected: PASS（3 tests）

- [ ] **Step 5: 回归全量 decisions 测试**

Run: `node --test scripts/test/devsphere-decisions.test.js scripts/test/devsphere-decisions-resolve.test.js`
Expected: PASS（10 tests）

- [ ] **Step 6: 提交**

```bash
git add scripts/devsphere-decisions.js scripts/test/devsphere-decisions-resolve.test.js
git commit -m "feat(decisions): add resolveMainArtifact path resolver"
```

---

## Task 3: PreToolUse 守卫 `check-decisions-resolved`

`devsphere-guard.js` 新增命令，读 PreToolUse stdin，对主产物写入做 gated-pending 拦截。

**Files:**
- Modify: `scripts/devsphere-guard.js`
- Create: `scripts/test/devsphere-guard-decisions.test.js`

**Interfaces:**
- Consumes: `devsphere-decisions.js` 的 `resolveMainArtifact`、`countGatedPending`、`readDecisions`。
- Produces:
  - `decideWrite(filePath) → {allow:boolean, reason?:string}`（纯函数，可测）
  - CLI `check-decisions-resolved`：读 stdin JSON → 取 `tool_input.file_path` → 调 `decideWrite` → 输出 PreToolUse 决策 JSON 或静默放行。

判定规则（与 spec §4.4 一致）：
- 非主产物 → `{allow:true}`
- 主产物但对应 decisions 文件不存在（scoping 未完成）→ `{allow:false, reason:'scoping 未完成：decisions 文件不存在，先做 scope'}`
- 主产物且 gated pending>0 → `{allow:false, reason:'还有 N 个 gated 决策待用户确认，先 resolve 再定稿'}`
- 主产物且 gated pending=0 → `{allow:true}`

- [ ] **Step 1: 写失败测试 `scripts/test/devsphere-guard-decisions.test.js`**

```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { makeTask } = require('./helpers');
const { initDecisions, addDecision, resolveDecision } = require('../devsphere-decisions');
const { decideWrite } = require('../devsphere-guard');

function mainArtifactPath(taskPath, slug) {
  return path.join(taskPath, 'artifacts', `${slug}.md`);
}

test('非主产物放行', () => {
  const { taskPath } = makeTask();
  const r = decideWrite(path.join(taskPath, 'decisions', 'business-design-decisions.json'));
  assert.strictEqual(r.allow, true);
});

test('主产物但 decisions 文件不存在 → 拒绝（scoping 未完成）', () => {
  const { taskPath, taskId } = makeTask();
  const r = decideWrite(mainArtifactPath(taskPath, 'business-design'));
  assert.strictEqual(r.allow, false);
  assert.match(r.reason, /scoping/);
});

test('主产物且 gated pending>0 → 拒绝', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: 'q',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select',
  });
  const r = decideWrite(mainArtifactPath(taskPath, 'business-design'));
  assert.strictEqual(r.allow, false);
  assert.match(r.reason, /1 个 gated/);
});

test('主产物且 gated pending=0 → 放行', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: 'q',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select',
  });
  resolveDecision(taskPath, 'business-design', 'BD-DEC-001', { chosen: 'a', decidedAt: 't' });
  const r = decideWrite(mainArtifactPath(taskPath, 'business-design'));
  assert.strictEqual(r.allow, true);
});

test('integrated-design.md 非设计阶段主产物 → 放行', () => {
  const { taskPath } = makeTask();
  const r = decideWrite(path.join(taskPath, 'artifacts', 'integrated-design.md'));
  assert.strictEqual(r.allow, true);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test scripts/test/devsphere-guard-decisions.test.js`
Expected: FAIL（`decideWrite is not a function`）

- [ ] **Step 3: 在 `devsphere-guard.js` 顶部加 require，并实现 `decideWrite`**

在文件顶部 require 区追加：
```javascript
const { resolveMainArtifact, countGatedPending, readDecisions } = require('./devsphere-decisions');
```

在 `checkApproveEntry` 之后插入：
```javascript
// PreToolUse 决策：主产物写入前，确保该阶段 gated 决策已全部 resolved。
function decideWrite(filePath) {
  const target = resolveMainArtifact(filePath);
  if (!target.isMainArtifact) return { allow: true };
  const { taskPath, slug } = target;
  const decisions = readDecisions(taskPath, slug);
  if (!decisions) {
    return { allow: false, reason: `scoping 未完成：${slug} 的 decisions 文件不存在，先完成 scope（出土决策）再定稿` };
  }
  const pending = countGatedPending(taskPath, slug);
  if (pending > 0) {
    return { allow: false, reason: `还有 ${pending} 个 gated 决策待用户确认，先 resolve 再定稿 ${slug}.md` };
  }
  return { allow: true };
}

// PreToolUse stdin 处理：输出 hookSpecificOutput.permissionDecision
function checkDecisionsResolvedFromStdin(stdinJson) {
  const filePath = stdinJson && stdinJson.tool_input && stdinJson.tool_input.file_path;
  if (!filePath) return null; // 无文件路径，不表态
  const d = decideWrite(filePath);
  if (d.allow) return null; // 静默放行（exit 0 无输出）
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: d.reason,
    },
  };
}
```

- [ ] **Step 4: 在 `devsphere-guard.js` 的 `main()` switch 增加 CLI 命令**

在 `case 'check-advance':` 之后、`default:` 之前插入：
```javascript
      case 'check-decisions-resolved': {
        let stdinJson = null;
        try {
          stdinJson = JSON.parse(fs.readFileSync(0, 'utf-8'));
        } catch (e) {
          process.exit(0); // 解析失败则不表态
        }
        const decision = checkDecisionsResolvedFromStdin(stdinJson);
        if (decision) {
          process.stdout.write(JSON.stringify(decision));
          process.exit(0);
        }
        process.exit(0); // 静默放行
        break;
      }
```

注意：`main()` 当前未 require `fs`，而 `check-implement` 内部已 `require('fs')`。在 `checkDecisionsResolvedFromStdin` 不需要 fs（只处理 JSON）；CLI 里读 stdin 用 `fs.readFileSync(0,...)`，需在文件顶部加 `const fs = require('fs');`（若顶部未有）。检查顶部：当前 `devsphere-guard.js` 顶部只有 `path` 与 state 的 require，`fs` 是在 `checkImplementEntry` 内局部 require。在顶部加一行 `const fs = require('fs');` 并移除 `checkImplementEntry` 内的局部 `const fs = require('fs');`（避免重复声明——局部那行在函数作用域内，与顶部全局不冲突，但为整洁移除局部那行，改用顶部全局）。

- [ ] **Step 5: 在 `module.exports` 增加 `decideWrite, checkDecisionsResolvedFromStdin`**

```javascript
module.exports = { checkImplementEntry, checkApproveEntry, checkStateAdvance, hasActiveTask, decideWrite, checkDecisionsResolvedFromStdin };
```

- [ ] **Step 6: 运行确认通过**

Run: `node --test scripts/test/devsphere-guard-decisions.test.js`
Expected: PASS（5 tests）

- [ ] **Step 7: 手动验证 CLI 拦截（模拟 stdin）**

```bash
T=$(mktemp -d) && node scripts/devsphere-workspace.js create-feature-task "$T" FEAT-G strict-human-loop
TP="$T/.devsphere/tasks/feature/FEAT-G"
# 主产物但无 decisions 文件 → 应 deny
echo '{"tool_name":"Write","tool_input":{"file_path":"'$TP'/artifacts/business-design.md","content":"x"}}' | node scripts/devsphere-guard.js check-decisions-resolved
echo "exit=$?"
# 非主产物 → 静默放行（无输出）
echo '{"tool_name":"Write","tool_input":{"file_path":"'$TP'/inputs/requirement.md","content":"x"}}' | node scripts/devsphere-guard.js check-decisions-resolved
echo "exit=$?"
```
Expected: 第一条 stdout 输出含 `"permissionDecision":"deny"` 且 `exit=0`；第二条无输出 `exit=0`。

- [ ] **Step 8: 提交**

```bash
git add scripts/devsphere-guard.js scripts/test/devsphere-guard-decisions.test.js
git commit -m "feat(guard): PreToolUse check-decisions-resolved blocks premature design artifact"
```

---

## Task 4: resolver 决策动作 `design-stage-action`

`feature-workflow.js` 新增确定性命令：给定 stage，依据磁盘事实返回该阶段决策循环的下一步动作（scope / ask / draft / ready-for-review）。

**Files:**
- Modify: `scripts/workflows/feature-workflow.js`
- Create: `scripts/test/feature-workflow-decisions.test.js`

**Interfaces:**
- Consumes: `devsphere-decisions.js` 的 `readDecisions`、`countGatedPending`；既有 `stageToArtifact`；`fs`。
- Produces:
  - `resolveDesignStageAction(taskPath, stageName) → {action, slug, gatedPending, reason}`，action ∈ `['scope','ask','draft','ready-for-review']`。
  - CLI 命令 `design-stage-action <taskPath> <stageName>`。

判定规则（spec §4.2，"decisions 文件存在 = scoping 已完成"）：
1. 主产物存在 → `ready-for-review`（已定稿，交给既有 review 流程）
2. decisions 文件不存在 → `scope`
3. decisions 文件存在且 gated pending>0 → `ask`
4. decisions 文件存在且 gated pending=0 → `draft`

- [ ] **Step 1: 写失败测试 `scripts/test/feature-workflow-decisions.test.js`**

```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { makeTask } = require('./helpers');
const { initDecisions, addDecision, resolveDecision } = require('../devsphere-decisions');
const { resolveDesignStageAction } = require('../workflows/feature-workflow');

test('主产物不存在 + 无 decisions → scope', () => {
  const { taskPath } = makeTask();
  const r = resolveDesignStageAction(taskPath, 'businessDesign');
  assert.strictEqual(r.action, 'scope');
});

test('decisions 存在 + gated pending>0 → ask', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: 'q',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select',
  });
  const r = resolveDesignStageAction(taskPath, 'businessDesign');
  assert.strictEqual(r.action, 'ask');
  assert.strictEqual(r.gatedPending, 1);
});

test('decisions 存在 + gated pending=0 → draft', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: 'q',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select',
  });
  resolveDecision(taskPath, 'business-design', 'BD-DEC-001', { chosen: 'a', decidedAt: 't' });
  const r = resolveDesignStageAction(taskPath, 'businessDesign');
  assert.strictEqual(r.action, 'draft');
  assert.strictEqual(r.gatedPending, 0);
});

test('主产物已存在 → ready-for-review', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  fs.writeFileSync(path.join(taskPath, 'artifacts', 'business-design.md'), 'done');
  const r = resolveDesignStageAction(taskPath, 'businessDesign');
  assert.strictEqual(r.action, 'ready-for-review');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test scripts/test/feature-workflow-decisions.test.js`
Expected: FAIL（`resolveDesignStageAction is not a function`）

- [ ] **Step 3: 在 `feature-workflow.js` 实现 `resolveDesignStageAction`**

顶部 require 区已有 `fs`、`path`、review-matrix、state。追加：
```javascript
const { readDecisions, countGatedPending } = require('../devsphere-decisions');
```

在 `resolveDesigning` 函数之后插入：
```javascript
// 设计阶段决策循环动作（spec §4.2）。确定性：仅依据磁盘事实。
function resolveDesignStageAction(taskPath, stageName) {
  const slug = stageToArtifact(stageName);
  const artifactPath = path.join(taskPath, 'artifacts', `${slug}.md`);
  if (fs.existsSync(artifactPath)) {
    return { action: 'ready-for-review', slug, gatedPending: 0, reason: `${stageName} 主产物已存在，交评审流程` };
  }
  const decisions = readDecisions(taskPath, slug);
  if (!decisions) {
    return { action: 'scope', slug, gatedPending: 0, reason: `${stageName} 未 scope：派 SA 查知识 + 出土 gated 决策` };
  }
  const pending = countGatedPending(taskPath, slug);
  if (pending > 0) {
    return { action: 'ask', slug, gatedPending: pending, reason: `${stageName} 有 ${pending} 个 gated 决策待用户确认` };
  }
  return { action: 'draft', slug, gatedPending: 0, reason: `${stageName} gated 决策已全部 resolved，可定稿` };
}
```

- [ ] **Step 4: 在 `main()` switch 增加 CLI 命令**

在 `case 'set-task-status':` 之前插入：
```javascript
    case 'design-stage-action': {
      const taskPath = args[1];
      const stageName = args[2];
      process.stdout.write(JSON.stringify(resolveDesignStageAction(taskPath, stageName)));
      break;
    }
```

- [ ] **Step 5: 在 `module.exports` 增加 `resolveDesignStageAction`**

```javascript
module.exports = { resolveNextAction, resolveDesignStageAction };
```

- [ ] **Step 6: 运行确认通过**

Run: `node --test scripts/test/feature-workflow-decisions.test.js`
Expected: PASS（4 tests）

- [ ] **Step 7: 手动验证 CLI**

```bash
T=$(mktemp -d) && node scripts/devsphere-workspace.js create-feature-task "$T" FEAT-D strict-human-loop
TP="$T/.devsphere/tasks/feature/FEAT-D"
node scripts/workflows/feature-workflow.js design-stage-action "$TP" businessDesign
```
Expected: `{"action":"scope","slug":"business-design","gatedPending":0,"reason":"..."}`

- [ ] **Step 8: 提交**

```bash
git add scripts/workflows/feature-workflow.js scripts/test/feature-workflow-decisions.test.js
git commit -m "feat(workflow): design-stage-action resolver for decision loop"
```

---

## Task 5: sync-stage-status 决策防错

`feature-workflow.js` 的 `sync-stage-status` 在把阶段置 `drafted` 前，校验 gated pending=0；否则跳过（不置 drafted）。

**Files:**
- Modify: `scripts/workflows/feature-workflow.js`（`sync-stage-status` 分支）
- Modify: `scripts/test/feature-workflow-decisions.test.js`（追加测试）

**Interfaces:** 复用 Task 4 的 `countGatedPending`、`readDecisions`。

- [ ] **Step 1: 在测试文件追加失败测试**

在 `scripts/test/feature-workflow-decisions.test.js` 末尾追加：

```javascript
const { execFileSync } = require('child_process');

function runSync(workspaceRoot) {
  const out = execFileSync('node', [
    path.join(__dirname, '..', 'workflows', 'feature-workflow.js'),
    'sync-stage-status', workspaceRoot,
  ], { encoding: 'utf-8' });
  return JSON.parse(out);
}

test('sync-stage-status 在 gated pending>0 时不置 drafted', () => {
  const { workspaceRoot, taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: 'q',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select',
  });
  // 模拟守卫被绕过：强行写主产物
  fs.writeFileSync(path.join(taskPath, 'artifacts', 'business-design.md'), 'x');
  const res = runSync(workspaceRoot);
  const { readState } = require('../devsphere-state');
  const state = readState(taskPath);
  assert.strictEqual(state.stages.businessDesign.status, 'not_started'); // 不升 drafted
});

test('sync-stage-status 在 gated pending=0 时正常置 drafted', () => {
  const { workspaceRoot, taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: 'q',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select',
  });
  resolveDecision(taskPath, 'business-design', 'BD-DEC-001', { chosen: 'a', decidedAt: 't' });
  fs.writeFileSync(path.join(taskPath, 'artifacts', 'business-design.md'), 'x');
  runSync(workspaceRoot);
  const { readState } = require('../devsphere-state');
  const state = readState(taskPath);
  assert.strictEqual(state.stages.businessDesign.status, 'drafted');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test scripts/test/feature-workflow-decisions.test.js`
Expected: 新增两条 FAIL（drafted 被错误置位）

- [ ] **Step 3: 改 `sync-stage-status` 的 drafted 判定**

定位 `case 'sync-stage-status':` 中：
```javascript
        // 确定性事实：artifact 存在 + not_started → drafted
        if (fs.existsSync(artifactPath) && stageData.status === 'not_started') {
          stageData.status = 'drafted';
          updated.push({ stage: stageName, from: 'not_started', to: 'drafted' });
        }
```
改为：
```javascript
        // 确定性事实：artifact 存在 + not_started + gated 决策已 resolved → drafted
        if (fs.existsSync(artifactPath) && stageData.status === 'not_started') {
          const slug = stageToArtifact(stageName);
          // 仅对四个设计阶段做决策门校验（integrated 等无 decisions）
          if (readDecisions(taskPath, slug) && countGatedPending(taskPath, slug) > 0) {
            // gated 未 resolved，禁止升 drafted（防错）
            continue;
          }
          stageData.status = 'drafted';
          updated.push({ stage: stageName, from: 'not_started', to: 'drafted' });
        }
```
说明：`readDecisions` 为 null（文件不存在）时不阻断——因为此分支要求主产物已存在，而 Task 3 守卫本应阻止「无 decisions 文件就写主产物」；此处只兜底「文件存在但 gated pending>0」。

- [ ] **Step 4: 运行确认通过**

Run: `node --test scripts/test/feature-workflow-decisions.test.js`
Expected: PASS（6 tests）

- [ ] **Step 5: 全量回归**

Run: `node --test scripts/test/devsphere-decisions.test.js scripts/test/devsphere-decisions-resolve.test.js scripts/test/devsphere-guard-decisions.test.js scripts/test/feature-workflow-decisions.test.js`
Expected: 全部 PASS（共 21 tests）

- [ ] **Step 6: 提交**

```bash
git add scripts/workflows/feature-workflow.js scripts/test/feature-workflow-decisions.test.js
git commit -m "feat(workflow): sync-stage-status refuses drafted while gated decisions pending"
```

---

## Task 6: decisions 模板 + hooks 接线

新建模板，把 PreToolUse 守卫接入 `hooks/hooks.json`。

**Files:**
- Create: `templates/decisions/stage-decisions-template.json`
- Modify: `hooks/hooks.json`

- [ ] **Step 1: 新建模板 `templates/decisions/stage-decisions-template.json`**

```json
{
  "stage": "{{STAGE_NAME}}",
  "taskId": "{{TASK_ID}}",
  "decisions": []
}
```

附同目录 `templates/decisions/README.md`（供 Plan B 的 skill 参考 decisions 条目结构）：

```markdown
# Decisions 文件

每条 decision 的结构（SA/SE/MDE/TSE 产出，主会话读 gated pending 代问用户）：

| 字段 | 说明 |
|------|------|
| id | `<PREFIX>-DEC-NNN`（BD/SD/ID/TD） |
| type | `gated`（需用户拍板）/ `autonomous`（自决仅记录） |
| category | feature_scope / assumption / open_question / business_rule / tradeoff |
| summary | 决策一句话 |
| rationale | 背景与依据（含 EV 引用），知识沉淀用 |
| options | gated 必填，2-4 项 {label, description} |
| recommendation | 推荐项 |
| askMode | single_select / multi_select / confirm_gate（gated 必填） |
| status | pending / decided |
| resolution | decided 时 {chosen, note, decidedAt} |
| evidence | [EV-xxx] |
| impact | 对下游阶段的影响 |

闸口只看 `type=gated && status=pending`；整个文件是该阶段决策日志。
```

- [ ] **Step 2: 修改 `hooks/hooks.json`，加 PreToolUse 守卫**

在 `"hooks"` 对象内、`"PostToolUse"` 同级新增 `"PreToolUse"`：

```json
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/scripts/devsphere-guard.js\" check-decisions-resolved"
          }
        ]
      }
    ],
```

完整文件应为：
```json
{
  "hooks": {
    "UserPromptExpansion": [
      {
        "matcher": "/scc-dev-sphere:feature-implement",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/scripts/devsphere-guard.js\" check-implement \"${CLAUDE_PLUGIN_ROOT}/..\""
          }
        ]
      },
      {
        "matcher": "/scc-dev-sphere:feature-approve",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/scripts/devsphere-guard.js\" check-approve \"${CLAUDE_PLUGIN_ROOT}/..\""
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/scripts/devsphere-guard.js\" check-decisions-resolved"
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

- [ ] **Step 3: 校验 hooks.json 是合法 JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf-8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: 端到端手动验证守卫接线（模拟真实 stdin，用绝对路径）**

```bash
T=$(mktemp -d) && node scripts/devsphere-workspace.js create-feature-task "$T" FEAT-E strict-human-loop
TP="$T/.devsphere/tasks/feature/FEAT-E"
node scripts/devsphere-decisions.js init "$TP" business-design FEAT-E businessDesign
node scripts/devsphere-decisions.js add "$TP" business-design '{"type":"gated","category":"feature_scope","summary":"注册?","options":[{"label":"要","description":"x"},{"label":"不要","description":"y"}],"askMode":"single_select"}'
# 写主产物 → 应被守卫 deny
echo '{"tool_name":"Write","tool_input":{"file_path":"'$TP'/artifacts/business-design.md","content":"x"}}' | node scripts/devsphere-guard.js check-decisions-resolved
# resolve 后再写 → 守卫放行（无输出）
node scripts/devsphere-decisions.js resolve "$TP" business-design BD-DEC-001 '{"chosen":"要","decidedAt":"2026-07-09T00:00:00Z"}'
echo '{"tool_name":"Write","tool_input":{"file_path":"'$TP'/artifacts/business-design.md","content":"x"}}' | node scripts/devsphere-guard.js check-decisions-resolved
echo "exit=$?"
```
Expected: 第一次输出含 `"permissionDecision":"deny"`；第二次无输出 `exit=0`。

- [ ] **Step 5: 提交**

```bash
git add templates/decisions/ hooks/hooks.json
git commit -m "feat(hooks): wire PreToolUse decision guard; add decisions template"
```

---

## 完成标准（Plan A）

- `node --test scripts/test/` 全绿。
- 端到端：gated 决策未 resolved 时，PreToolUse 守卫 deny 主产物写入；resolved 后放行。
- resolver `design-stage-action` 对四态（scope/ask/draft/ready-for-review）返回正确动作。
- sync-stage-status 不再在 gated pending 时错误升 drafted。
- 不改 state.json 枚举；决策 resolved 状态不进 state.json。

## 给 Plan B 的接口契约（skill/agent 采纳时直接用）

- 初始化某阶段 decisions：`node scripts/devsphere-decisions.js init <taskPath> <slug> <taskId> <stageName>`
- SA 出土 gated 决策：`... add <taskPath> <slug> '<JSON>'`
- 主会话 resolve：`... resolve <taskPath> <slug> <decisionId> '<JSON>'`
- 查待决数：`... count-gated-pending <taskPath> <slug>` → `{"count":N}`
- 查当前阶段下一步：`node scripts/workflows/feature-workflow.js design-stage-action <taskPath> <stageName>` → `{"action":..., "slug":..., "gatedPending":..., "reason":...}`
- slug ↔ stage ↔ agent：`business-design/businessDesign/sa`、`solution-design/solutionDesign/se`、`implementation-design/implementationDesign/mde`、`test-design/testDesign/tse`。
