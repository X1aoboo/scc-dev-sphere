# 设计循环 resolver (resolve-design-loop) — Plan B1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `feature-workflow.js` 新增确定性的 `resolveDesignLoop(taskPath)`，为设计阶段整个生命周期（scope/ask/draft/review/revise/human_confirm）返回精确 nextAction，让编排器 skill 退化为薄执行器。

**Architecture:** 复用 Plan A 的 `resolveDesignStageAction`（pre-artifact：scope/ask/draft/ready-for-review）+ 新增 post-artifact 路由（review/revise/human_confirm）。阶段选择用既有的 mode-aware `isStageReady`。`ask` 携带 decisions 数据（`listGatedPending` → `toQuestionData`），主会话逐字转 AskUserQuestion。`humanGated` 标志贯穿三模式；`ask` 在 `humanGated` 上双重门控。CIE 经 `state.ciCdRisk` 触发（B1 只读，B2 的 feature-assess 负责写）。

**Tech Stack:** Node.js (CommonJS)，无依赖。测试 Node 内置 `node:test` + `node:assert`（`node --test`，Node ≥ 18）。

## Global Constraints

- 不新增 npm 依赖、不新增 package.json、不新增构建步骤。脚本是 CommonJS，CLI + `require()` 双用途。
- 不修改 Plan A 已有的 `resolveDesignStageAction`、`sync-stage-status`、既有 `resolveNextAction`/`resolveDesigning`（B1 只新增，不改既有路由——编排器改写是 B2）。
- 设计阶段顺序固定：`businessDesign → solutionDesign → implementationDesign → testDesign`。
- decisions 文件路径与 slug 沿用 Plan A：`decisions/<slug>-decisions.json`，slug = `business-design`/`solution-design`/`implementation-design`/`test-design`。
- 「当前阶段」= 顺序中第一个未就绪的阶段；就绪由既有 `isStageReady(stageStatus, stage, mode, humanGates)` 判定（mode-aware）。
- `ask` 仅当 `humanGated=true && gated pending>0`；否则视同 `draft`（防 auto-design 误产 gated 错问用户）。
- `state.ciCdRisk` 是新字段（boolean）；B1 只读取（`=== true` 才加 CIE），默认 undefined 视为 false。写入由 B2 的 feature-assess 负责。
- 所有 CLI 错误 → stderr + exit 1；正常输出 → stdout JSON。
- 测试用 `os.tmpdir()`（复用 Plan A 的 `scripts/test/helpers.js` 的 `makeTask`），不污染真实工作区。

## Spec 覆盖映射（Plan B spec `2026-07-09-design-loop-plan-b.md`）

| Spec 节 | 本 Plan 任务 |
|---|---|
| §2 `resolve-design-loop` 6 动作 + 阶段选择 | Task 2（pre-artifact）+ Task 3（post-artifact）+ Task 4（all-ready/CLI） |
| §2 `ask_decisions` 数据组装 | Task 1（`toQuestionData`）+ Task 2（ask 分支） |
| §4 `humanGated` 三模式 + ask 双重门控 | Task 1（`isHumanGated`）+ Task 2 |
| §2 CIE 触发条件 | Task 3（`state.ciCdRisk`） |
| §3/§5 review/revise 进动作模型 | Task 3 |
| 编排器 skill 接线（workflow/feature-design） | **B2（不在本 Plan）** |

---

## File Structure

| 文件 | 责任 | 任务 |
|---|---|---|
| `scripts/workflows/feature-workflow.js` (改) | 新增 `resolveDesignLoop` + `resolveDesignStage` + `resolvePostArtifact` + helpers + CLI `resolve-design-loop` + 导出 | Task 1-4 |
| `scripts/test/design-loop-resolver.test.js` (新建) | `resolveDesignLoop` 全生命周期测试 | Task 1-4 |

---

## Task 1: helpers（`isHumanGated` + `toQuestionData` + 阶段顺序常量）

纯函数，先单独落地、单独测。

**Files:**
- Modify: `scripts/workflows/feature-workflow.js`
- Create: `scripts/test/design-loop-resolver.test.js`

**Interfaces:**
- Consumes: 无（纯函数）。
- Produces: `DESIGN_STAGE_ORDER`（数组）、`isHumanGated(mode, stageName, humanGates) → boolean`、`toQuestionData(decision) → {id, summary, options, recommendation, askMode}`。后续 task 依赖。

- [ ] **Step 1: 写失败测试 `scripts/test/design-loop-resolver.test.js`**

```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { isHumanGated, toQuestionData, DESIGN_STAGE_ORDER } = require('../workflows/feature-workflow');

test('DESIGN_STAGE_ORDER 固定四阶段顺序', () => {
  assert.deepStrictEqual(DESIGN_STAGE_ORDER, ['businessDesign', 'solutionDesign', 'implementationDesign', 'testDesign']);
});

test('isHumanGated: strict 全阶段 true', () => {
  assert.strictEqual(isHumanGated('strict-human-loop', 'businessDesign', []), true);
  assert.strictEqual(isHumanGated('strict-human-loop', 'testDesign', []), true);
});

test('isHumanGated: collaborative 仅门禁阶段 true', () => {
  assert.strictEqual(isHumanGated('collaborative-design', 'businessDesign', ['businessDesign', 'testDesign']), true);
  assert.strictEqual(isHumanGated('collaborative-design', 'solutionDesign', ['businessDesign', 'testDesign']), false);
});

test('isHumanGated: auto-design 全 false', () => {
  assert.strictEqual(isHumanGated('auto-design', 'businessDesign', []), false);
});

test('toQuestionData 映射 gated decision 为问询数据', () => {
  const d = {
    id: 'BD-DEC-001', type: 'gated', category: 'feature_scope',
    summary: '注册登录？', rationale: 'x',
    options: [{ label: '要', description: 'a' }, { label: '不要', description: 'b' }],
    recommendation: '要', askMode: 'single_select', status: 'pending', resolution: null,
    evidence: [], impact: '',
  };
  const q = toQuestionData(d);
  assert.strictEqual(q.id, 'BD-DEC-001');
  assert.strictEqual(q.summary, '注册登录？');
  assert.strictEqual(q.options.length, 2);
  assert.strictEqual(q.recommendation, '要');
  assert.strictEqual(q.askMode, 'single_select');
});

test('toQuestionData 对缺失字段给默认值', () => {
  const q = toQuestionData({ id: 'X-1', summary: 's' });
  assert.deepStrictEqual(q.options, []);
  assert.strictEqual(q.recommendation, '');
  assert.strictEqual(q.askMode, 'single_select');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test scripts/test/design-loop-resolver.test.js`
Expected: FAIL（`isHumanGated is not a function` / 未导出）

- [ ] **Step 3: 在 `feature-workflow.js` 实现 helpers**

在 `getDesignReviewers` 函数之后、`makeAction` 之前插入：

```javascript
const DESIGN_STAGE_ORDER = ['businessDesign', 'solutionDesign', 'implementationDesign', 'testDesign'];

// 当前阶段是否要求人工决策门（spec §4）。strict 全阶段；collaborative 仅门禁阶段；auto-design 否。
function isHumanGated(mode, stageName, humanGates) {
  if (mode === 'strict-human-loop') return true;
  if (mode === 'collaborative-design' && Array.isArray(humanGates) && humanGates.includes(stageName)) return true;
  return false;
}

// 把一条 gated decision 映射成主会话构造 AskUserQuestion 所需的最小数据（spec §6 字段映射的源）。
function toQuestionData(decision) {
  if (!decision) return null;
  return {
    id: decision.id,
    summary: decision.summary,
    options: Array.isArray(decision.options) ? decision.options : [],
    recommendation: decision.recommendation || '',
    askMode: decision.askMode || 'single_select',
  };
}
```

并在文件顶部 decisions 的 require 行，把 `listGatedPending` 加进去（Task 2 会用到，先一起导入）：
```javascript
const { readDecisions, countGatedPending, listGatedPending } = require('../devsphere-decisions');
```

- [ ] **Step 4: 在 `module.exports` 增加导出**

```javascript
module.exports = { resolveNextAction, resolveDesignStageAction, isHumanGated, toQuestionData, DESIGN_STAGE_ORDER };
```

- [ ] **Step 5: 运行确认通过**

Run: `node --test scripts/test/design-loop-resolver.test.js`
Expected: PASS（6 tests）

- [ ] **Step 6: 回归既有测试不被破坏**

Run: `node --test scripts/test/feature-workflow-decisions.test.js`
Expected: PASS（既有 6 tests 不受影响）

- [ ] **Step 7: 提交**

```bash
git add scripts/workflows/feature-workflow.js scripts/test/design-loop-resolver.test.js
git commit -m "feat(workflow): design-loop helpers (isHumanGated, toQuestionData, stage order)"
```

---

## Task 2: `resolveDesignLoop` pre-artifact 路由（scope/ask/draft）

阶段选择 + pre-artifact 三分支，含 `ask` 双重门控与 `ask_decisions` 数据组装。

**Files:**
- Modify: `scripts/workflows/feature-workflow.js`
- Modify: `scripts/test/design-loop-resolver.test.js`（追加测试）

**Interfaces:**
- Consumes: Task 1 的 `DESIGN_STAGE_ORDER`/`isHumanGated`/`toQuestionData`；Plan A 的 `resolveDesignStageAction`/`isStageReady`/`stageToArtifact`/`getDesignAgent`/`getDesignSkill`；`readState`/`listGatedPending`。
- Produces: `resolveDesignLoop(taskPath) → nextAction`（pre-artifact 分支在此 task 落地；ready-for-review 分支暂时回退到 show_status，Task 3 接管）、`resolveDesignStage(taskPath, state, stage, mode, humanGates)`（内部函数）。

- [ ] **Step 1: 追加失败测试（pre-artifact 全分支）**

在 `scripts/test/design-loop-resolver.test.js` 顶部 require 区追加：
```javascript
const fs = require('fs');
const path = require('path');
const { makeTask } = require('./helpers');
const { resolveDesignLoop } = require('../workflows/feature-workflow');
const { initDecisions, addDecision, resolveDecision } = require('../devsphere-decisions');
const { writeState } = require('../devsphere-state');

function writeArtifact(taskPath, slug) {
  fs.writeFileSync(path.join(taskPath, 'artifacts', `${slug}.md`), 'draft');
}
function markStage(taskPath, stage, status) {
  const { readState } = require('../devsphere-state');
  const st = readState(taskPath);
  st.stages[stage].status = status;
  writeState(taskPath, st);
}
function addGated(taskPath, slug) {
  addDecision(taskPath, slug, {
    type: 'gated', category: 'feature_scope', summary: 'q',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select',
  });
}
```

追加测试：
```javascript
test('strict 模式 + 无 decisions → scope（dispatch_agent, humanGated=true）', () => {
  const { taskPath } = makeTask({ workflowMode: 'strict-human-loop' });
  const r = resolveDesignLoop(taskPath);
  assert.strictEqual(r.kind, 'dispatch_agent');
  assert.strictEqual(r.mode, 'scope');
  assert.strictEqual(r.stage, 'businessDesign');
  assert.strictEqual(r.agent, 'sa');
  assert.strictEqual(r.skill, 'feature-design-business');
  assert.strictEqual(r.humanGated, true);
});

test('strict 模式 + gated pending → ask_decisions 含映射数据', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'strict-human-loop' });
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addGated(taskPath, 'business-design');
  const r = resolveDesignLoop(taskPath);
  assert.strictEqual(r.kind, 'ask_decisions');
  assert.strictEqual(r.stage, 'businessDesign');
  assert.strictEqual(r.decisions.length, 1);
  assert.strictEqual(r.decisions[0].id, 'BD-DEC-001');
  assert.strictEqual(r.decisions[0].options.length, 2);
});

test('strict 模式 + gated 全 resolved → draft', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'strict-human-loop' });
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addGated(taskPath, 'business-design');
  resolveDecision(taskPath, 'business-design', 'BD-DEC-001', { chosen: 'a', decidedAt: 't' });
  const r = resolveDesignLoop(taskPath);
  assert.strictEqual(r.kind, 'dispatch_agent');
  assert.strictEqual(r.mode, 'draft');
});

test('auto-design + gated pending → draft（双重门控跳过 ask）', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'auto-design' });
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addGated(taskPath, 'business-design');
  const r = resolveDesignLoop(taskPath);
  assert.strictEqual(r.kind, 'dispatch_agent');
  assert.strictEqual(r.mode, 'draft');
});

test('collaborative：门禁阶段 pending → ask；非门禁阶段 pending → draft', () => {
  // 门禁阶段 businessDesign
  const t1 = makeTask({ workflowMode: 'collaborative-design' });
  const s1 = require('../devsphere-state').readState(t1.taskPath);
  s1.humanGateStages = ['businessDesign'];
  writeState(t1.taskPath, s1);
  initDecisions(t1.taskPath, 'business-design', t1.taskId, 'businessDesign');
  addGated(t1.taskPath, 'business-design');
  assert.strictEqual(resolveDesignLoop(t1.taskPath).kind, 'ask_decisions');

  // 非门禁阶段 solutionDesign：humanGateStages 只含 testDesign，故 business/solution 均非门禁。
  // 把 businessDesign 推到 ai_review_passed（非门禁 → 就绪），使 solutionDesign 成为当前阶段。
  const t2 = makeTask({ workflowMode: 'collaborative-design' });
  const s2 = require('../devsphere-state').readState(t2.taskPath);
  s2.humanGateStages = ['testDesign'];
  writeState(t2.taskPath, s2);
  markStage(t2.taskPath, 'businessDesign', 'ai_review_passed');
  initDecisions(t2.taskPath, 'solution-design', t2.taskId, 'solutionDesign');
  addGated(t2.taskPath, 'solution-design');
  const r = resolveDesignLoop(t2.taskPath);
  assert.strictEqual(r.kind, 'dispatch_agent');
  assert.strictEqual(r.mode, 'draft');
  assert.strictEqual(r.stage, 'solutionDesign');
});

test('全部阶段 ai_review_passed（auto-design）→ all_design_stages_ready', () => {
  const { taskPath } = makeTask({ workflowMode: 'auto-design' });
  for (const stg of ['businessDesign', 'solutionDesign', 'implementationDesign', 'testDesign']) {
    markStage(taskPath, stg, 'ai_review_passed');
  }
  const r = resolveDesignLoop(taskPath);
  assert.strictEqual(r.kind, 'all_design_stages_ready');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test scripts/test/design-loop-resolver.test.js`
Expected: 新增 6 条 FAIL（`resolveDesignLoop is not a function`）

- [ ] **Step 3: 在 `feature-workflow.js` 实现 `resolveDesignLoop` + `resolveDesignStage`（pre-artifact）**

在 `toQuestionData` 之后插入：

```javascript
// 设计循环总入口（spec §2）。确定性：读 state + 磁盘事实，返回精确 nextAction。
function resolveDesignLoop(taskPath) {
  const state = readState(taskPath);
  if (!state || !state.stages) return { kind: 'show_status', reason: 'No stages in state' };
  const mode = state.workflowMode || 'auto-design';
  const humanGates = state.humanGateStages || [];

  const currentStage = DESIGN_STAGE_ORDER.find(
    s => !isStageReady((state.stages[s] || {}).status, s, mode, humanGates)
  );
  if (!currentStage) {
    return { kind: 'all_design_stages_ready', reason: '全部设计阶段就绪，进入 integrated-design' };
  }
  return resolveDesignStage(taskPath, state, currentStage, mode, humanGates);
}

// 单阶段路由：pre-artifact（scope/ask/draft）+ ready-for-review（post-artifact，Task 3 接管）。
function resolveDesignStage(taskPath, state, stage, mode, humanGates) {
  const slug = stageToArtifact(stage);
  const humanGated = isHumanGated(mode, stage, humanGates);
  const stageAction = resolveDesignStageAction(taskPath, stage);

  if (stageAction.action === 'scope') {
    return { kind: 'dispatch_agent', mode: 'scope', stage, slug, agent: getDesignAgent(stage), skill: getDesignSkill(stage), humanGated, reason: stageAction.reason };
  }
  if (stageAction.action === 'ask') {
    // 双重门控：仅 humanGated 才 ask；否则当 draft（防 auto-design 误产 gated）
    if (!humanGated) {
      return { kind: 'dispatch_agent', mode: 'draft', stage, slug, agent: getDesignAgent(stage), skill: getDesignSkill(stage), reason: `${stage}：非人工门禁，跳过 ask 直接定稿` };
    }
    const decisions = listGatedPending(taskPath, slug).map(toQuestionData);
    return { kind: 'ask_decisions', stage, slug, decisions, reason: stageAction.reason };
  }
  if (stageAction.action === 'draft') {
    return { kind: 'dispatch_agent', mode: 'draft', stage, slug, agent: getDesignAgent(stage), skill: getDesignSkill(stage), reason: stageAction.reason };
  }
  // ready-for-review → post-artifact（Task 3 实现；暂回退）
  return { kind: 'show_status', stage, slug, reason: `${stage} 主产物已存在，待 post-artifact 路由` };
}
```

- [ ] **Step 4: 在 `module.exports` 增加 `resolveDesignLoop`**

```javascript
module.exports = { resolveNextAction, resolveDesignStageAction, resolveDesignLoop, isHumanGated, toQuestionData, DESIGN_STAGE_ORDER };
```

- [ ] **Step 5: 运行确认通过**

Run: `node --test scripts/test/design-loop-resolver.test.js`
Expected: PASS（Task 1 的 6 + 本 task 的 6 = 12 tests）

- [ ] **Step 6: 提交**

```bash
git add scripts/workflows/feature-workflow.js scripts/test/design-loop-resolver.test.js
git commit -m "feat(workflow): resolveDesignLoop pre-artifact routing (scope/ask/draft)"
```

---

## Task 3: post-artifact 路由（review/revise/human_confirm）+ CIE 触发

接管 `ready-for-review`：blocking→revise、drafted→review（含 CIE）、ai_review_passed+人工模式→human_confirm。

**Files:**
- Modify: `scripts/workflows/feature-workflow.js`
- Modify: `scripts/test/design-loop-resolver.test.js`（追加测试）

**Interfaces:**
- Consumes: `readMatrix`/`hasBlocking`（已导入）、`getDesignReviewers`、`state.ciCdRisk`。
- Produces: `resolvePostArtifact(taskPath, state, stage, slug, mode, humanGates) → nextAction`；`resolveDesignStage` 的 ready-for-review 分支改为调用它。

- [ ] **Step 1: 追加失败测试**

在 `scripts/test/design-loop-resolver.test.js` 顶部 require 区追加：
```javascript
const { initMatrix, addIssue } = require('../devsphere-review-matrix');
```
追加测试：
```javascript
test('artifact 存在 + drafted + 无 blocking + 无 ciCdRisk → dispatch_reviewers（基础评审者）', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'strict-human-loop' });
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  writeArtifact(taskPath, 'business-design');   // 触发 drafted 由 sync-stage-status；这里直接置 drafted
  markStage(taskPath, 'businessDesign', 'drafted');
  const r = resolveDesignLoop(taskPath);
  assert.strictEqual(r.kind, 'dispatch_reviewers');
  assert.strictEqual(r.stage, 'businessDesign');
  assert.deepStrictEqual(r.reviewers, ['se']);   // businessDesign 评审者
  assert.strictEqual(r.skill, 'feature-review');
});

test('artifact 存在 + blocking → revise（dispatch_agent draft）', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'strict-human-loop' });
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  writeArtifact(taskPath, 'business-design');
  markStage(taskPath, 'businessDesign', 'drafted');
  initMatrix(taskPath);
  addIssue(taskPath, 'business-design', { type: 'blocking', reviewerAgent: 'se' });
  const r = resolveDesignLoop(taskPath);
  assert.strictEqual(r.kind, 'dispatch_agent');
  assert.strictEqual(r.mode, 'draft');
  assert.strictEqual(r.stage, 'businessDesign');
});

test('ciCdRisk=true → 评审者含 cie', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'strict-human-loop' });
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  writeArtifact(taskPath, 'business-design');
  markStage(taskPath, 'businessDesign', 'drafted');
  const st = require('../devsphere-state').readState(taskPath);
  st.ciCdRisk = true;
  writeState(taskPath, st);
  const r = resolveDesignLoop(taskPath);
  assert.strictEqual(r.kind, 'dispatch_reviewers');
  assert.ok(r.reviewers.includes('cie'));
});

test('ai_review_passed + strict → human_confirm', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'strict-human-loop' });
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  writeArtifact(taskPath, 'business-design');
  markStage(taskPath, 'businessDesign', 'ai_review_passed');
  const r = resolveDesignLoop(taskPath);
  assert.strictEqual(r.kind, 'human_confirm');
  assert.strictEqual(r.stage, 'businessDesign');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test scripts/test/design-loop-resolver.test.js`
Expected: 新增 4 条 FAIL（`ready-for-review` 还回退 show_status，reviewers/human_confirm 断言失败）

- [ ] **Step 3: 在 `feature-workflow.js` 实现 `resolvePostArtifact`**

在 `resolveDesignStage` 之后插入：

```javascript
// post-artifact 路由（spec §2/§5）：blocking→revise；drafted→review（含 CIE）；ai_review_passed+人工模式→human_confirm。
function resolvePostArtifact(taskPath, state, stage, slug, mode, humanGates) {
  const matrix = readMatrix(taskPath);
  const stageStatus = (state.stages[stage] || {}).status;

  if (hasBlocking(matrix, slug)) {
    return { kind: 'dispatch_agent', mode: 'draft', stage, slug, agent: getDesignAgent(stage), skill: getDesignSkill(stage), reason: `${stage} 有 blocking 评审项，修订后重评审` };
  }
  if (stageStatus === 'drafted') {
    const reviewers = (getDesignReviewers(stage) || []).slice();
    if (state.ciCdRisk === true && !reviewers.includes('cie')) reviewers.push('cie');
    return { kind: 'dispatch_reviewers', stage, slug, reviewers, skill: 'feature-review', reason: `${stage} 已 drafted，派评审（reviewers: ${reviewers.join(',')}）` };
  }
  if (stageStatus === 'ai_review_passed' && isHumanGated(mode, stage, humanGates)) {
    return { kind: 'human_confirm', stage, slug, reason: `${stage} 评审通过，待人工批准` };
  }
  return { kind: 'show_status', stage, slug, reason: `${stage} 状态 ${stageStatus}，无明确下一步` };
}
```

并把 `resolveDesignStage` 末尾的 ready-for-review 回退改为调用它：
```javascript
  // ready-for-review → post-artifact
  return resolvePostArtifact(taskPath, state, stage, slug, mode, humanGates);
```
（删除原 `{ kind: 'show_status', ... 待 post-artifact 路由 }` 那行）

- [ ] **Step 4: 运行确认通过**

Run: `node --test scripts/test/design-loop-resolver.test.js`
Expected: PASS（12 + 4 = 16 tests）

- [ ] **Step 5: 全量回归**

Run: `node --test scripts/test/devsphere-decisions.test.js scripts/test/devsphere-decisions-resolve.test.js scripts/test/devsphere-guard-decisions.test.js scripts/test/feature-workflow-decisions.test.js scripts/test/design-loop-resolver.test.js`
Expected: 全部 PASS（既有 35 + 本 plan 16 = 51）

- [ ] **Step 6: 提交**

```bash
git add scripts/workflows/feature-workflow.js scripts/test/design-loop-resolver.test.js
git commit -m "feat(workflow): resolveDesignLoop post-artifact routing (review/revise/human_confirm) + CIE trigger"
```

---

## Task 4: CLI `resolve-design-loop` + 导出 + 手动验证

把 `resolveDesignLoop` 暴露为 CLI 命令，供 B2 的 workflow skill 调用。

**Files:**
- Modify: `scripts/workflows/feature-workflow.js`（`main()` switch 增 case）
- Modify: `scripts/test/design-loop-resolver.test.js`（追加 CLI 烟雾测试）

**Interfaces:**
- Produces: CLI `resolve-design-loop <taskPath>` → stdout 输出 nextAction JSON。

- [ ] **Step 1: 追加 CLI 烟雾测试**

在 `scripts/test/design-loop-resolver.test.js` 顶部 require 区追加：
```javascript
const { execFileSync } = require('child_process');
```
追加测试：
```javascript
test('CLI resolve-design-loop 输出 scope 动作 JSON', () => {
  const { taskPath } = makeTask({ workflowMode: 'strict-human-loop' });
  const out = execFileSync('node', [
    path.join(__dirname, '..', 'workflows', 'feature-workflow.js'),
    'resolve-design-loop', taskPath,
  ], { encoding: 'utf-8' });
  const r = JSON.parse(out);
  assert.strictEqual(r.kind, 'dispatch_agent');
  assert.strictEqual(r.mode, 'scope');
  assert.strictEqual(r.stage, 'businessDesign');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test scripts/test/design-loop-resolver.test.js`
Expected: 新增 1 条 FAIL（CLI 无 resolve-design-loop 命令 → 输出非预期 / 命令未处理）

- [ ] **Step 3: 在 `main()` switch 增 case**

在 `case 'design-stage-action':` 之后插入：
```javascript
    case 'resolve-design-loop': {
      const taskPath = args[1];
      process.stdout.write(JSON.stringify(resolveDesignLoop(taskPath)));
      break;
    }
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test scripts/test/design-loop-resolver.test.js`
Expected: PASS（17 tests）

- [ ] **Step 5: 全量回归**

Run: `node --test scripts/test/devsphere-decisions.test.js scripts/test/devsphere-decisions-resolve.test.js scripts/test/devsphere-guard-decisions.test.js scripts/test/feature-workflow-decisions.test.js scripts/test/design-loop-resolver.test.js`
Expected: 全部 PASS（52）

- [ ] **Step 6: 手动验证 CLI（端到端）**

```bash
T=$(mktemp -d) && node scripts/devsphere-workspace.js create-feature-task "$T" FEAT-L strict-human-loop
TP="$T/.devsphere/tasks/feature/FEAT-L"
echo "--- scope ---" && node scripts/workflows/feature-workflow.js resolve-design-loop "$TP"
node scripts/devsphere-decisions.js init "$TP" business-design FEAT-L businessDesign
node scripts/devsphere-decisions.js add "$TP" business-design '{"type":"gated","category":"feature_scope","summary":"注册?","options":[{"label":"要","description":"x"},{"label":"不要","description":"y"}],"askMode":"single_select"}'
echo "--- ask_decisions ---" && node scripts/workflows/feature-workflow.js resolve-design-loop "$TP"
node scripts/devsphere-decisions.js resolve "$TP" business-design BD-DEC-001 '{"chosen":"要","decidedAt":"2026-07-09T00:00:00Z"}'
echo "--- draft ---" && node scripts/workflows/feature-workflow.js resolve-design-loop "$TP"
```
Expected: scope → `{"kind":"dispatch_agent","mode":"scope",...}`；ask_decisions → `{"kind":"ask_decisions","decisions":[{"id":"BD-DEC-001",...}]}`；draft → `{"kind":"dispatch_agent","mode":"draft",...}`。

- [ ] **Step 7: 提交**

```bash
git add scripts/workflows/feature-workflow.js scripts/test/design-loop-resolver.test.js
git commit -m "feat(workflow): resolve-design-loop CLI command"
```

---

## 完成标准（Plan B1）

- `node --test`（全部 5 个测试文件）全绿，共 52（既有 35 + 新 17）。
- `resolveDesignLoop` 对全生命周期 6 动作（scope/ask/draft/review/revise/human_confirm）+ all_design_stages_ready 返回正确 nextAction。
- 三模式（strict / collaborative 门禁 vs 非门禁 / auto-design）路由正确；`ask` 双重门控生效。
- `ask_decisions` 携带映射后的决策数据（id/summary/options/recommendation/askMode）。
- CIE 经 `state.ciCdRisk === true` 加入评审者。
- 不改动 Plan A 的 `resolveDesignStageAction`/`sync-stage-status`/`resolveNextAction`/`resolveDesigning`。

## 给 Plan B2 的接口契约

- `node scripts/workflows/feature-workflow.js resolve-design-loop <taskPath>` → nextAction JSON，kind ∈ `dispatch_agent`(mode scope/draft) / `ask_decisions` / `dispatch_reviewers` / `human_confirm` / `all_design_stages_ready` / `show_status`。
- workflow/feature-design skill（B2）对 `designing` 状态调此命令，按 kind 执行：
  - `dispatch_agent` → agent-teams 派发对应 agent，prompt 指明 mode（scope/draft）；scope 带 `humanGated`。
  - `ask_decisions` → 主会话逐条 AskUserQuestion（按 spec §6 字段映射），回写 `devsphere-decisions.js resolve`。
  - `dispatch_reviewers` → agent-teams 派发 reviewers 跑 feature-review。
  - `human_confirm` → AskUserQuestion（confirm_gate）。
  - `all_design_stages_ready` → 进 integrated-design。
- B2 的 feature-assess 需把 CI/CD 风险评估结果写入 `state.ciCdRisk`（boolean），resolveDesignLoop 据此触发 CIE。
