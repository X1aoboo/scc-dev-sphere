# feature-design-router 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `feature-design` SKILL 中自然语言承载的设计阶段状态流转/动作选择,固化为确定性纯函数 router(`scripts/feature-design-router.js`),SKILL 退化为薄执行器。

**Architecture:** 新增 `feature-design-router.js`:读 state + decisions + review-matrix(只读),输出一个 designAction JSON。`feature-design/SKILL.md` 重写为"咨询 router → 用原生 teammate 原语执行"的事件驱动薄循环,不持 agentId、不造控制流状态机。`feature-workflow.js` 中删 `resolve-design-loop` 后遗留的孤儿辅助函数搬进 router 并获测试覆盖。hooks/守卫/dispatch/decisions/review-matrix CRUD 一律不改。

**Tech Stack:** Node.js(CommonJS,`require`/`module.exports`),`node:test` + `node:assert`,无构建步骤。CLI + 双用途(require-able)脚本,沿用现有 `scripts/` 约定。

## Global Constraints

- **不改的文件**(本计划严格不碰):`hooks/hooks.json`、`scripts/devsphere-guard.js`、`scripts/devsphere-dispatch.js`、`scripts/devsphere-decisions.js`、`scripts/devsphere-review-matrix.js`、`scripts/devsphere-state.js`、`templates/`。
- **状态写权**:router 只读不写。status 推进仍由 `workflows/feature-workflow.js` 的 `set-task-status` / `set-stage-status` / `sync-stage-status` 写命令完成。
- **agentId**:插件不持有、不持久化 teammate agentId。teammate 寻址用确定性名字 `<role>-<stage>`(owner)/`<role>-review-<stage>`(评审者)。身份/唤醒归 Claude Code harness。
- **测试约定**:沿用 `scripts/test/`(node:test);fixture 用 `scripts/test/helpers.js` 的 `makeTask()`;CI 无,手动 `node --test scripts/test/`。
- **`state.json.designRevisionLimit`**(round 上限,默认 25；缺失时兼容回退为 25)。
- **派发词**:router 输出的 `dispatchCmd` 调 `devsphere-dispatch.js build`,SKILL 原样执行其 stdout,不自由发挥。

---

## 文件结构

| 文件 | 责任 | 本计划 |
|------|------|--------|
| `scripts/feature-design-router.js`(新) | 纯函数 router + 搬入的辅助函数 + CLI 入口 | 创建 |
| `scripts/test/feature-design-router.test.js`(新) | router 单元测试 | 创建 |
| `scripts/workflows/feature-workflow.js` | 删被搬走的辅助函数;`resolveDesigning` 不变 | 改 |
| `scripts/test/feature-workflow-decisions.test.js` | 把 `isHumanGated`/`DESIGN_STAGE_ORDER` 的 import 源改为 router | 改 |
| `skills/feature-design/SKILL.md` | 重写为薄执行器 | 改 |

---

## Task 1: 创建 router 骨架 + 搬入辅助函数

**Files:**
- Create: `scripts/feature-design-router.js`
- Test: `scripts/test/feature-design-router.test.js`

**Interfaces:**
- Produces: `DESIGN_STAGE_ORDER`, `isHumanGated(mode, stageName, humanGates)→boolean`, `isStageReady(stageStatus, stageName, mode, humanGates)→boolean`, `stageToArtifact(stageName)→slug`, `getDesignAgent(stageName)→role`, `getDesignSkill(stageName)→skillName`, `resolveDesignAction(taskPath, state)→designAction`(本 task 仅 `design_phase_complete` 分支)。

- [ ] **Step 1: 写失败测试(辅助函数 + 全完成分支)**

创建 `scripts/test/feature-design-router.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeTask } = require('./helpers');
const { initMatrix } = require('../devsphere-review-matrix');
const {
  DESIGN_STAGE_ORDER, isHumanGated, isStageReady, stageToArtifact,
  getDesignAgent, getDesignSkill, resolveDesignAction,
} = require('../feature-design-router');

test('DESIGN_STAGE_ORDER 固定四阶段顺序', () => {
  assert.deepStrictEqual(DESIGN_STAGE_ORDER,
    ['businessDesign', 'solutionDesign', 'implementationDesign', 'testDesign']);
});

test('isHumanGated 三模式', () => {
  assert.strictEqual(isHumanGated('strict-human-loop', 'businessDesign', []), true);
  assert.strictEqual(isHumanGated('collaborative-design', 'businessDesign', ['businessDesign']), true);
  assert.strictEqual(isHumanGated('collaborative-design', 'solutionDesign', ['businessDesign']), false);
  assert.strictEqual(isHumanGated('auto-design', 'businessDesign', []), false);
});

test('isStageReady 三模式', () => {
  assert.strictEqual(isStageReady('human_approved', 'businessDesign', 'strict-human-loop', []), true);
  assert.strictEqual(isStageReady('ai_review_passed', 'businessDesign', 'strict-human-loop', []), false);
  assert.strictEqual(isStageReady('ai_review_passed', 'solutionDesign', 'collaborative-design', ['businessDesign']), true);
  assert.strictEqual(isStageReady('human_approved', 'solutionDesign', 'auto-design', []), true);
});

test('stageToArtifact / getDesignAgent / getDesignSkill', () => {
  assert.strictEqual(stageToArtifact('businessDesign'), 'business-design');
  assert.strictEqual(getDesignAgent('solutionDesign'), 'se');
  assert.strictEqual(getDesignSkill('testDesign'), 'feature-design-test');
});

test('resolveDesignAction: 四阶段全完成 → design_phase_complete', () => {
  const { taskPath } = makeTask({ workflowMode: 'auto-design' });
  const { readState } = require('../devsphere-state');
  const state = readState(taskPath);
  for (const stage of DESIGN_STAGE_ORDER) state.stages[stage].status = 'ai_review_passed';
  const action = resolveDesignAction(taskPath, state);
  assert.strictEqual(action.kind, 'design_phase_complete');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test scripts/test/feature-design-router.test.js`
Expected: FAIL — `Cannot find module '../feature-design-router'`。

- [ ] **Step 3: 创建 router 文件(辅助函数 + design_phase_complete 分支)**

创建 `scripts/feature-design-router.js`:

```js
#!/usr/bin/env node
'use strict';

const path = require('path');
const { listGatedPending } = require('./devsphere-decisions');
const { readMatrix, getBaseReviewers } = require('./devsphere-review-matrix');

const DISPATCH_SCRIPT = path.join(__dirname, 'devsphere-dispatch.js');
const DEFAULT_DESIGN_REVISION_LIMIT = 25;

const DESIGN_STAGE_ORDER = ['businessDesign', 'solutionDesign', 'implementationDesign', 'testDesign'];

function isHumanGated(mode, stageName, humanGates) {
  if (mode === 'strict-human-loop') return true;
  if (mode === 'collaborative-design' && Array.isArray(humanGates) && humanGates.includes(stageName)) return true;
  return false;
}

function isStageReady(stageStatus, stageName, mode, humanGates) {
  if (mode === 'strict-human-loop') return stageStatus === 'human_approved';
  if (mode === 'collaborative-design' && Array.isArray(humanGates) && humanGates.includes(stageName)) {
    return stageStatus === 'human_approved';
  }
  return stageStatus === 'ai_review_passed' || stageStatus === 'human_approved';
}

function stageToArtifact(stageName) {
  return {
    businessDesign: 'business-design',
    solutionDesign: 'solution-design',
    implementationDesign: 'implementation-design',
    testDesign: 'test-design',
  }[stageName] || stageName;
}

function getDesignAgent(stageName) {
  return { businessDesign: 'sa', solutionDesign: 'se', implementationDesign: 'mde', testDesign: 'tse' }[stageName];
}

function getDesignSkill(stageName) {
  return {
    businessDesign: 'feature-design-business',
    solutionDesign: 'feature-design-solution',
    implementationDesign: 'feature-design-implementation',
    testDesign: 'feature-design-test',
  }[stageName];
}

// resolveDesignAction 其余分支在后续 task 增量补全。
function resolveDesignAction(taskPath, state) {
  const mode = state.workflowMode || 'auto-design';
  const humanGates = state.humanGateStages || [];
  const stages = state.stages || {};

  for (const stage of DESIGN_STAGE_ORDER) {
    const stageData = stages[stage] || { status: 'not_started' };
    if (isStageReady(stageData.status, stage, mode, humanGates)) continue;
    // 其余分支后续 task 实现;本 task 先只处理"全完成"。
    return { kind: 'not_implemented', stage };
  }
  return { kind: 'design_phase_complete', reason: '四个设计阶段全部完成,进入 integrated-design' };
}

module.exports = {
  DESIGN_STAGE_ORDER, isHumanGated, isStageReady, stageToArtifact,
  getDesignAgent, getDesignSkill, resolveDesignAction,
};

// CLI 入口在 Task 4 补。
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test scripts/test/feature-design-router.test.js`
Expected: PASS(6 tests)。`resolveDesignAction` 的 `not_implemented` 分支不会被"全完成"测试命中。

- [ ] **Step 5: Commit**

```bash
git add scripts/feature-design-router.js scripts/test/feature-design-router.test.js
git commit -m "feat(router): scaffold feature-design-router + migrate design helpers"
```

---

## Task 2: not_started 分支(produce_draft initial + ask_gated)

**Files:**
- Modify: `scripts/feature-design-router.js`(补 `not_started` 分支 + 内部助手 `teammateName` / `designDispatchCmd`)
- Test: `scripts/test/feature-design-router.test.js`(追加测试)

**Interfaces:**
- Produces: `resolveDesignAction` 在 `status==='not_started'` 时返回:
  - `gatedPending===0` → `{ kind:'produce_draft', stage, slug, humanGated, reason, role, skill, mode, name:'<role>-<stage>', payload:{mode:'initial'}, dispatchCmd }`
  - `gatedPending>0` → `{ kind:'ask_gated', stage, slug, humanGated, reason, name:'<role>-<stage>', decisions:[...] }`(decisions 为 `listGatedPending` 全字段)
- Consumes: `listGatedPending(taskPath, slug)`(来自 `devsphere-decisions`,已存在)。

- [ ] **Step 1: 追加失败测试**

在 `feature-design-router.test.js` 顶部 require 区追加:
```js
const { initDecisions, addDecision } = require('../devsphere-decisions');
```
在文件末尾追加:
```js
test('not_started + 无 gated → produce_draft initial', () => {
  const { taskPath } = makeTask({ workflowMode: 'strict-human-loop' });
  const { readState } = require('../devsphere-state');
  const action = resolveDesignAction(taskPath, readState(taskPath));
  assert.strictEqual(action.kind, 'produce_draft');
  assert.strictEqual(action.stage, 'businessDesign');
  assert.strictEqual(action.role, 'sa');
  assert.strictEqual(action.skill, 'feature-design-business');
  assert.strictEqual(action.name, 'sa-businessDesign');
  assert.strictEqual(action.humanGated, true);
  assert.strictEqual(action.payload.mode, 'initial');
  assert.ok(action.dispatchCmd.includes('build design sa businessDesign '), 'dispatchCmd 含 design 派发参数');
  assert.ok(action.dispatchCmd.includes('feature-design-business'), 'dispatchCmd 含 skill');
});

test('not_started + 有 gated pending → ask_gated', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'strict-human-loop' });
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: '范围待定',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }],
    askMode: 'single_select', rationale: 'r',
  });
  const { readState } = require('../devsphere-state');
  const action = resolveDesignAction(taskPath, readState(taskPath));
  assert.strictEqual(action.kind, 'ask_gated');
  assert.strictEqual(action.stage, 'businessDesign');
  assert.strictEqual(action.name, 'sa-businessDesign');
  assert.strictEqual(action.decisions.length, 1);
  assert.strictEqual(action.decisions[0].id, 'BD-DEC-001');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test scripts/test/feature-design-router.test.js`
Expected: 两个新测试 FAIL(返回 `not_implemented`)。

- [ ] **Step 3: 实现 not_started 分支**

在 `feature-design-router.js` 的辅助函数区(`getDesignSkill` 之后)追加:
```js
function teammateName(role, stage) {
  return `${role}-${stage}`;
}

function designDispatchCmd(role, stage, taskPath, skill, humanGated, mode) {
  return `node "${DISPATCH_SCRIPT}" build design ${role} ${stage} ${taskPath} ${skill} ${humanGated} ${mode}`;
}
```

把 `resolveDesignAction` 中 `return { kind: 'not_implemented', stage };` 这一行替换为整个 `not_started` 处理块。最终 `resolveDesignAction` 应为:
```js
function resolveDesignAction(taskPath, state) {
  const mode = state.workflowMode || 'auto-design';
  const humanGates = state.humanGateStages || [];
  const stages = state.stages || {};

  for (const stage of DESIGN_STAGE_ORDER) {
    const stageData = stages[stage] || { status: 'not_started' };
    if (isStageReady(stageData.status, stage, mode, humanGates)) continue;

    const slug = stageToArtifact(stage);
    const gated = isHumanGated(mode, stage, humanGates);
    const role = getDesignAgent(stage);
    const skill = getDesignSkill(stage);
    const name = teammateName(role, stage);

    if (stageData.status === 'not_started') {
      const pending = listGatedPending(taskPath, slug);
      if (pending.length > 0) {
        return {
          kind: 'ask_gated', stage, slug, humanGated: gated, reason: `${stage} 有 ${pending.length} 项 gated decision 待代问`,
          name, decisions: pending,
        };
      }
      return {
        kind: 'produce_draft', stage, slug, humanGated: gated, reason: `${stage} 派发 owner 产 draft`,
        role, skill, mode, name, payload: { mode: 'initial' },
        dispatchCmd: designDispatchCmd(role, stage, taskPath, skill, gated, mode),
      };
    }
    return { kind: 'not_implemented', stage, status: stageData.status };
  }
  return { kind: 'design_phase_complete', reason: '四个设计阶段全部完成,进入 integrated-design' };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test scripts/test/feature-design-router.test.js`
Expected: PASS(8 tests)。

- [ ] **Step 5: Commit**

```bash
git add scripts/feature-design-router.js scripts/test/feature-design-router.test.js
git commit -m "feat(router): not_started branch — produce_draft initial + ask_gated"
```

---

## Task 3: drafted 分支(dispatch_reviews / revise / design_blocked)+ ai_review_passed 分支(human_approve / skip)

**Files:**
- Modify: `scripts/feature-design-router.js`(补 `drafted` 与 `ai_review_passed` 分支 + 内部助手 `maxBlockingRound` / `openBlockingIssues` / `reviewerName` / `reviewDispatchCmd` / `buildReviewers`)
- Test: `scripts/test/feature-design-router.test.js`(追加测试)

**Interfaces:**
- Produces:
  - `drafted` + `round>=state.designRevisionLimit` → `{ kind:'design_blocked', stage, slug, reason }`
  - `drafted` + `blocking>0` → `{ kind:'produce_draft', ..., payload:{mode:'revise', blockingItems:[...]} }`
  - `drafted` + `matrixStatus==='pending'`(评审未跑) → `{ kind:'dispatch_reviews', stage, slug, humanGated, reason, artifactPath, reviewers:[{role,name,dispatchCmd}] }`
  - `drafted` + `matrixStatus==='reviewed'`(兜底,sync 正常会先升 ai_review_passed):门禁→`human_approve`;非门禁→skip
  - `ai_review_passed`:门禁→`human_approve`;非门禁→skip(下一阶段)
- `reviewers` 含 `BASE_REVIEWERS[slug]` + `state.ciCdRisk===true` 时追加 `'cie'`。
- Consumes: `readMatrix(taskPath)`、`getBaseReviewers(slug)`(review-matrix,已存在)。

> **"评审是否跑过"的信号**:`matrix.artifacts[slug].status`。`feature-review` skill 评审通过时 `set-status <slug> reviewed`(blocking=0 门禁)→ 非 pending;有 blocking 时 status 仍 pending 但 issuesList 有 blocking issue。故 `drafted` 下:`blocking>0 → revise`;否则 `matrixStatus==='pending' → dispatch_reviews`;`matrixStatus!=='pending' → 通过`。

- [ ] **Step 1: 追加失败测试**

在 `feature-design-router.test.js` 顶部 require 区追加:
```js
const { initMatrix, addIssue, setArtifactStatus } = require('../devsphere-review-matrix');
```
末尾追加:
```js
test('drafted + 评审未跑(pending) → dispatch_reviews', () => {
  const { taskPath } = makeTask({ workflowMode: 'auto-design' });
  initMatrix(taskPath);
  const { readState, writeState } = require('../devsphere-state');
  const state = readState(taskPath);
  state.stages.businessDesign.status = 'drafted';
  writeState(taskPath, state);
  const action = resolveDesignAction(taskPath, state);
  assert.strictEqual(action.kind, 'dispatch_reviews');
  assert.strictEqual(action.stage, 'businessDesign');
  assert.ok(action.artifactPath.endsWith('artifacts/business-design.md'));
  assert.strictEqual(action.reviewers.length, 1); // business-design 基础评审者只有 se
  assert.strictEqual(action.reviewers[0].role, 'se');
  assert.strictEqual(action.reviewers[0].name, 'se-review-businessDesign');
  assert.ok(action.reviewers[0].dispatchCmd.includes('build review se businessDesign '));
});

test('drafted + ciCdRisk=true → 评审者含 cie', () => {
  const { taskPath } = makeTask({ workflowMode: 'auto-design' });
  initMatrix(taskPath);
  const { readState, writeState } = require('../devsphere-state');
  const state = readState(taskPath);
  state.stages.businessDesign.status = 'drafted';
  state.ciCdRisk = true;
  writeState(taskPath, state);
  const action = resolveDesignAction(taskPath, state);
  assert.ok(action.reviewers.some(r => r.role === 'cie'));
});

test('drafted + blocking>0 → produce_draft revise', () => {
  const { taskPath } = makeTask({ workflowMode: 'auto-design' });
  initMatrix(taskPath);
  addIssue(taskPath, 'business-design', { type: 'blocking', reviewerAgent: 'se', round: 1 });
  const { readState, writeState } = require('../devsphere-state');
  const state = readState(taskPath);
  state.stages.businessDesign.status = 'drafted';
  writeState(taskPath, state);
  const action = resolveDesignAction(taskPath, state);
  assert.strictEqual(action.kind, 'produce_draft');
  assert.strictEqual(action.payload.mode, 'revise');
  assert.strictEqual(action.payload.blockingItems.length, 1);
});

test('drafted + round 达上限 → design_blocked', () => {
  const { taskPath } = makeTask({ workflowMode: 'auto-design' });
  initMatrix(taskPath);
  addIssue(taskPath, 'business-design', { type: 'blocking', reviewerAgent: 'se', round: 3 });
  const { readState, writeState } = require('../devsphere-state');
  const state = readState(taskPath);
  state.stages.businessDesign.status = 'drafted';
  writeState(taskPath, state);
  const action = resolveDesignAction(taskPath, state);
  assert.strictEqual(action.kind, 'design_blocked');
});

test('ai_review_passed + 门禁 → human_approve', () => {
  const { taskPath } = makeTask({ workflowMode: 'strict-human-loop' });
  const { readState } = require('../devsphere-state');
  const state = readState(taskPath);
  state.stages.businessDesign.status = 'ai_review_passed';
  const action = resolveDesignAction(taskPath, state);
  assert.strictEqual(action.kind, 'human_approve');
  assert.strictEqual(action.stage, 'businessDesign');
});

test('ai_review_passed + 非门禁 → skip 到下一阶段', () => {
  const { taskPath } = makeTask({ workflowMode: 'auto-design' });
  const { readState } = require('../devsphere-state');
  const state = readState(taskPath);
  state.stages.businessDesign.status = 'ai_review_passed';
  const action = resolveDesignAction(taskPath, state);
  assert.strictEqual(action.kind, 'produce_draft');
  assert.strictEqual(action.stage, 'solutionDesign'); // 跳到下一未完成阶段
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test scripts/test/feature-design-router.test.js`
Expected: 6 个新测试 FAIL。

- [ ] **Step 3: 实现 drafted / ai_review_passed 分支 + 助手**

在 `feature-design-router.js` 的助手区(`designDispatchCmd` 之后)追加:
```js
function maxBlockingRound(matrix, slug) {
  if (!matrix || !matrix.artifacts || !matrix.artifacts[slug]) return 0;
  const list = matrix.artifacts[slug].issuesList || [];
  return list.reduce(
    (m, i) => (i.type === 'blocking' && i.status === 'open' ? Math.max(m, i.round || 1) : m), 0);
}

function openBlockingIssues(matrix, slug) {
  if (!matrix || !matrix.artifacts || !matrix.artifacts[slug]) return [];
  return (matrix.artifacts[slug].issuesList || [])
    .filter(i => i.type === 'blocking' && i.status === 'open');
}

function reviewerName(role, stage) {
  return `${role}-review-${stage}`;
}

function reviewDispatchCmd(role, stage, taskPath, artifactPath) {
  return `node "${DISPATCH_SCRIPT}" build review ${role} ${stage} ${taskPath} scc-dev-sphere:feature-review ${artifactPath}`;
}

function buildReviewers(stage, slug, state, taskPath) {
  const artifactPath = path.join(taskPath, 'artifacts', `${slug}.md`);
  const roles = getBaseReviewers(slug).slice();
  if (state.ciCdRisk === true && !roles.includes('cie')) roles.push('cie');
  return roles.map(role => ({
    role, name: reviewerName(role, stage),
    dispatchCmd: reviewDispatchCmd(role, stage, taskPath, artifactPath),
  }));
}
```

把 `resolveDesignAction` 中 `return { kind: 'not_implemented', stage, status: stageData.status };` 替换为 drafted / ai_review_passed 处理。最终 `resolveDesignAction` 从 `const slug = ...` 起应为:
```js
    const slug = stageToArtifact(stage);
    const gated = isHumanGated(mode, stage, humanGates);
    const role = getDesignAgent(stage);
    const skill = getDesignSkill(stage);
    const name = teammateName(role, stage);

    if (stageData.status === 'not_started') {
      const pending = listGatedPending(taskPath, slug);
      if (pending.length > 0) {
        return {
          kind: 'ask_gated', stage, slug, humanGated: gated,
          reason: `${stage} 有 ${pending.length} 项 gated decision 待代问`, name, decisions: pending,
        };
      }
      return {
        kind: 'produce_draft', stage, slug, humanGated: gated,
        reason: `${stage} 派发 owner 产 draft`,
        role, skill, mode, name, payload: { mode: 'initial' },
        dispatchCmd: designDispatchCmd(role, stage, taskPath, skill, gated, mode),
      };
    }

    if (stageData.status === 'drafted') {
      const matrix = readMatrix(taskPath);
      const entry = matrix && matrix.artifacts ? matrix.artifacts[slug] : null;
      const blocking = entry ? entry.issues.blocking : 0;
      const matrixStatus = entry ? entry.status : 'pending';

      if (maxBlockingRound(matrix, slug) >= state.designRevisionLimit) {
        return { kind: 'design_blocked', stage, slug, reason: `${stage} revise 超过 ${state.designRevisionLimit} 轮上限` };
      }
      if (blocking > 0) {
        return {
          kind: 'produce_draft', stage, slug, humanGated: gated,
          reason: `${stage} 评审 blocking=${blocking},回流 owner revise`,
          role, skill, mode, name,
          payload: { mode: 'revise', blockingItems: openBlockingIssues(matrix, slug) },
          dispatchCmd: designDispatchCmd(role, stage, taskPath, skill, gated, mode),
        };
      }
      if (matrixStatus === 'pending') {
        return {
          kind: 'dispatch_reviews', stage, slug, humanGated: gated,
          reason: `${stage} 派发交叉评审`,
          artifactPath: path.join(taskPath, 'artifacts', `${slug}.md`),
          reviewers: buildReviewers(stage, slug, state, taskPath),
        };
      }
      // matrixStatus === 'reviewed',blocking=0:sync 正常已升 ai_review_passed;兜底
      if (gated) return { kind: 'human_approve', stage, slug, humanGated: true, reason: `${stage} 评审通过,请求人工批准` };
      continue; // 非门禁视为完成
    }

    if (stageData.status === 'ai_review_passed') {
      if (gated) return { kind: 'human_approve', stage, slug, humanGated: true, reason: `${stage} 评审通过,请求人工批准` };
      continue; // 非门禁视为完成,下一阶段
    }
    // 'human_approved' → isStageReady 已 continue
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test scripts/test/feature-design-router.test.js`
Expected: PASS(14 tests)。

- [ ] **Step 5: Commit**

```bash
git add scripts/feature-design-router.js scripts/test/feature-design-router.test.js
git commit -m "feat(router): drafted + ai_review_passed branches — reviews/revise/block/approve"
```

---

## Task 4: router CLI 入口

**Files:**
- Modify: `scripts/feature-design-router.js`(追加 `main()` + `require.main` 守卫,export `routeDesign`)
- Test: `scripts/test/feature-design-router.test.js`(追加 CLI 端到端测试)

**Interfaces:**
- Produces: CLI `node scripts/feature-design-router.js <workspaceRoot>` → stdout 输出 `resolveDesignAction` 结果 JSON。`routeDesign(workspaceRoot)→designAction`(读 current-task + state,调 resolveDesignAction)。
- Consumes: `readCurrentTask(workspaceRoot)`、`getTaskPath(workspaceRoot)`、`readState(taskPath)`(devsphere-state,已存在)。

- [ ] **Step 1: 追加失败测试**

在 `feature-design-router.test.js` 顶部 require 区追加:
```js
const { execFileSync } = require('child_process');
```
末尾追加:
```js
test('CLI: workspaceRoot → stdout JSON', () => {
  const { workspaceRoot } = makeTask({ workflowMode: 'strict-human-loop' });
  const out = execFileSync('node',
    [path.join(__dirname, '..', 'feature-design-router.js'), workspaceRoot],
    { encoding: 'utf-8' });
  const action = JSON.parse(out);
  assert.strictEqual(action.kind, 'produce_draft');
  assert.strictEqual(action.stage, 'businessDesign');
});
```
(该测试要求 `path` 已 require —— 在文件顶部 `const path = require('path');` 已有,若无须补。)

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test scripts/test/feature-design-router.test.js`
Expected: 新测试 FAIL(脚本无 CLI 入口,execFileSync 报错或无输出)。

- [ ] **Step 3: 实现 CLI 入口**

在 `feature-design-router.js` 末尾(`module.exports` 之前)追加:
```js
const { readCurrentTask, getTaskPath, readState } = require('./devsphere-state');

function routeDesign(workspaceRoot) {
  const current = readCurrentTask(workspaceRoot);
  if (!current || !current.activeTaskId) {
    return { kind: 'show_status', reason: 'No active task.' };
  }
  const taskPath = getTaskPath(workspaceRoot);
  const state = readState(taskPath);
  if (!state) return { kind: 'blocked', reason: 'State file not found.' };
  return resolveDesignAction(taskPath, state);
}

function main() {
  const workspaceRoot = process.argv[2] || process.cwd();
  try {
    process.stdout.write(JSON.stringify(routeDesign(workspaceRoot), null, 2));
  } catch (e) {
    process.stderr.write(`Error: ${e.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) main();
```
并把 `routeDesign` 加入 `module.exports`:
```js
module.exports = {
  DESIGN_STAGE_ORDER, isHumanGated, isStageReady, stageToArtifact,
  getDesignAgent, getDesignSkill, resolveDesignAction, routeDesign,
};
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test scripts/test/feature-design-router.test.js`
Expected: PASS(15 tests)。另手动验证:`node scripts/feature-design-router.js <某真实 task workspaceRoot>` 输出 JSON。

- [ ] **Step 5: Commit**

```bash
git add scripts/feature-design-router.js scripts/test/feature-design-router.test.js
git commit -m "feat(router): CLI entry — workspaceRoot → designAction JSON"
```

---

## Task 5: 从 feature-workflow.js 移除已搬走的辅助函数,修正旧测试 import

**Files:**
- Modify: `scripts/workflows/feature-workflow.js`(删 `DESIGN_STAGE_ORDER` / `isHumanGated` / `isStageReady` / `stageToArtifact` / `getDesignAgent` / `getDesignSkill` / `getDesignReviewers`;更新 `module.exports`)
- Modify: `scripts/test/feature-workflow-decisions.test.js`(import 源从 `../workflows/feature-workflow` 改为 `../feature-design-router`)

**Interfaces:**
- 移除后 `feature-workflow.js` 不再定义这些函数;`feature-design-router.js` 是唯一来源。`resolveNextAction` / `resolveDesigning` / CLI 命令不受影响(它们不调用这些辅助函数 —— 见当前代码 `feature-workflow.js:107-114` `resolveDesigning` 只返回固定 stub)。

- [ ] **Step 1: 修正旧测试 import(先改测试,让它驱动验证)**

在 `scripts/test/feature-workflow-decisions.test.js` 第 8 行:
```js
const { isHumanGated, DESIGN_STAGE_ORDER } = require('../workflows/feature-workflow');
```
改为:
```js
const { isHumanGated, DESIGN_STAGE_ORDER } = require('../feature-design-router');
```

- [ ] **Step 2: 从 feature-workflow.js 删除辅助函数**

打开 `scripts/workflows/feature-workflow.js`,删除以下定义(Task 1 已在 router 复制):
- `isStageReady`(约 118-124 行)
- `stageToArtifact`(约 126-134 行)
- `getDesignSkill`(约 136-144 行)
- `getDesignAgent`(约 146-154 行)
- `getDesignReviewers`(约 156-164 行)
- `DESIGN_STAGE_ORDER`(约 166 行)
- `isHumanGated`(约 169-173 行)

把末尾 `module.exports` 从:
```js
module.exports = { resolveNextAction, isHumanGated, DESIGN_STAGE_ORDER };
```
改为:
```js
module.exports = { resolveNextAction };
```

- [ ] **Step 3: 跑全部测试确认通过**

Run: `node --test scripts/test/`
Expected: PASS(feature-workflow-decisions.test.js + feature-design-router.test.js 全绿)。确认 `resolveDesigning` 与 CLI 命令未引用被删函数(它们没有)。

- [ ] **Step 4: 手动验证 workflow resolver 仍工作**

Run: `node scripts/devsphere-workflow.js <某含 active task 的 workspaceRoot>`
Expected: 正常输出 nextAction JSON(status==='designing' 时仍返回 `skill:'feature-design'`)。

- [ ] **Step 5: Commit**

```bash
git add scripts/workflows/feature-workflow.js scripts/test/feature-workflow-decisions.test.js
git commit -m "refactor(workflow): move design helpers to feature-design-router (single source)"
```

---

## Task 6: 重写 feature-design SKILL 为薄执行器

**Files:**
- Modify: `skills/feature-design/SKILL.md`(整文件重写)

**Interfaces:**
- 本 task 无代码测试(SKILL 是给 LLM 的指令)。验证 = 人工评审 SKILL 内容符合 router 契约 + 读一遍确认无控制流判断残留。

**契约对照(router 输出 → SKILL 执行):**
- `produce_draft{initial}` → `devsphere-decisions init` + 执行 `dispatchCmd` → 用返回的 stdout 作 prompt spawn 名为 `action.name` 的 teammate。
- `produce_draft{continue|revise}` → 按 `action.name` message 该 teammate(message 内容由 `payload.resolutions` / `payload.blockingItems` 组装,summary 必填)。
- `ask_gated` → 逐项 `AskUserQuestion`(interaction-guidelines decision_loop)→ 每项 `devsphere-decisions.js resolve`。
- `dispatch_reviews` → 并行 spawn 各 `reviewers[].name` 的 teammate,prompt = 各 `dispatchCmd` 的 stdout。
- `human_approve` → `AskUserQuestion` confirm_gate → 批准:`set-stage-status <stage> human_approved`;驳回:把反馈作为 blocking 注入 matrix(经 `devsphere-review-matrix.js add`)。
- `design_phase_complete` → 跑 integrated-design(既有逻辑)→ `set-task-status design_ready`。
- `design_blocked` → 展示 reason,停。

- [ ] **Step 1: 整文件重写 SKILL.md**

把 `skills/feature-design/SKILL.md` 全文替换为:
```markdown
---
name: feature-design
description: 设计阶段薄执行器。在主会话(team lead)运行:事件驱动地咨询 feature-design-router 拿下一步动作,用原生 teammate 原语执行。不持 agentId、不造控制流。依赖 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1。
---

# Feature Design — 设计阶段薄执行器

你在主会话(team lead)运行(agents=[])。**你不自行判断阶段流转或动作选择** —— 一律由确定性 router 决定。你只负责:咨询 router → 用原生 teammate 原语执行返回的动作。

## 入口(固定行,无分支)

进入设计阶段第一步,写状态:
```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js set-task-status ${CLAUDE_PROJECT_DIR} designing
```

## 咨询循环(事件驱动)

**何时咨询**:入口后;以及每次 teammate 回报(idle 通知 / 消息:draft 成、N 项 gated 待代问、评审完成、blocking=N)后。**等待 teammate 期间不咨询**(依赖 agent-teams 的消息自动送达 + idle 自动通知)。

每次咨询:
1. `node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js sync-stage-status ${CLAUDE_PROJECT_DIR}`
2. `node ${CLAUDE_SKILL_DIR}/../../scripts/feature-design-router.js ${CLAUDE_PROJECT_DIR}` → stdout 是一个 designAction JSON。
3. 按 `action.kind` 执行(见下)。执行后要么等 teammate 回报(自然再咨询),要么立即回到步骤 1 重咨询。

## 按 kind 执行

### `produce_draft`
- `payload.mode === 'initial'`:
  1. `node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-decisions.js init <taskPath> <slug> <taskId> <stage>`(初始化该阶段 decisions 文件;<taskPath>/<slug>/<taskId>/<stage> 从 action 与 current-task 取)。
  2. 执行 `action.dispatchCmd`,把 **stdout 原样**作为 Agent prompt,**后台 spawn** 一个名为 `action.name`(形如 `sa-businessDesign`)的 teammate。
- `payload.mode === 'continue'` 或 `'revise'`:
  - **按名字 message** 名为 `action.name` 的 teammate(agent-teams 原语:存在则唤醒续线程;不存在则按 initial 的 dispatchCmd 重新 spawn)。message 内容:continue 时附 `payload.resolutions`;revise 时附 `payload.blockingItems`。**message 为字符串时必带 summary**。
- 执行后**等 teammate 回报**,不重咨询。

### `ask_gated`
- 对 `action.decisions` **逐项** AskUserQuestion(遵循 `references/interaction-guidelines.md` 的 decision_loop,按各 decision 的 `askMode` 选 single_select/multi_select/confirm_gate,`options`/`recommendation` 直接取自 decision)。
- 每项用户决策后回写:
  ```bash
  node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-decisions.js resolve <taskPath> <slug> <decision.id> '<resolution json>'
  ```
  `<resolution json>` 形如 `{"chosen":"<选项 label>","note":"<可选>"}'`。
- 全部 resolve 后**立即重咨询**(步骤 1)。

### `dispatch_reviews`
- 对 `action.reviewers` **并行**后台 spawn:每个执行其 `dispatchCmd`,stdout 原样作为 Agent prompt,teammate 名为其 `name`(形如 `se-review-businessDesign`)。
- 评审是 one-shot,不持 agentId。执行后**等所有评审回报**,不重咨询。

### `human_approve`
- AskUserQuestion(confirm_gate 模式)请用户批准 `action.stage` 的设计。
- **批准**:`node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js set-stage-status <taskPath> <stage> human_approved` → 重咨询。
- **驳回**:把用户反馈作为 blocking issue 注入 matrix(经 `devsphere-review-matrix.js add <taskPath> <slug> '{"type":"blocking","reviewerAgent":"human","round":N}'`)→ 重咨询(router 将转 revise)。

### `design_phase_complete`
- 跑 integrated-design(既有逻辑:组装四阶段产物 → 交叉评审 → 通过)。
- 完成后:`node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js set-task-status ${CLAUDE_PROJECT_DIR} design_ready`。
- 结束(下次 `/workflow` 会路由到 feature-approve)。

### `design_blocked`
- 展示 `action.reason`,停止。等人工介入。

## 约束

- **不自行写派发词** —— 派发 prompt 一律执行 `action.dispatchCmd` 的 stdout。
- **不直接写设计产物 / decisions** —— 产物由 teammate 写;decisions 只经 CLI;status 只经 feature-workflow.js 写命令。
- **不持 agentId / 不维护 teammate 注册表** —— 寻址用 action 里的确定性名字,存在性/wake 归 harness。
- **不判断阶段流转** —— 选哪个阶段、做什么动作,全由 router 决定;你只执行。
```

- [ ] **Step 2: 人工评审 SKILL**

读一遍确认:(a) 无"if 阶段未完成则.../if humanGated 则..."控制判断残留;(b) 每个 kind 的执行映射与 router 输出字段一致(name/dispatchCmd/payload.mode/decisions/reviewers/blockingItems);(c) 入口固定行写 `designing`。

- [ ] **Step 3: 跑全部测试(回归确认无脚本被破坏)**

Run: `node --test scripts/test/`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add skills/feature-design/SKILL.md
git commit -m "refactor(skill): feature-design thin executor — router-driven, no control flow"
```

---

## Self-Review(写计划后自查)

**1. Spec 覆盖**:
- §3 架构/边界 → Task 1(router 只读)+ Task 5(feature-workflow 移交)+ Task 6(SKILL 薄执行)。✅
- §4.1 前置契约(入口 set-task-status designing、咨询前 sync、边界咨询)→ Task 6 SKILL 入口与循环。✅
- §4.2 designAction 6 种 kind → Task 2(produce_draft/ask_gated)+ Task 3(dispatch_reviews/revise/design_blocked/human_approve/design_phase_complete)。✅
- §4.3 决策树 → Task 1-3 增量实现并测试每个格子。✅
- §4.4 阶段流转(emergent,无 advance 动作)→ router 循环 + isStageReady 测试。✅
- §4.5 复活死代码 → Task 5。✅
- §5 SKILL 薄指令(原生原语、不持 agentId、resume 不特殊处理)→ Task 6。✅
- §7 测试策略 → Task 1-4 单测覆盖决策树每格 + 三模式 + 名字 + dispatchCmd。✅
- §9 round 依赖 → 验证发现 `feature-review` skill 已实现 round 递增 + max-3;router 的 design_blocked 为防御性兜底(Task 3 测试 round=3 场景)。spec 称"既有 gap"略过头,实现上无需补 round 递增逻辑(已在 review skill)。✅

**2. 占位符扫描**:无 TBD/TODO;每个 code step 含完整代码;dispatchCmd/name 字段在测试中断言。✅

**3. 类型一致性**:`resolveDesignAction(taskPath, state)` 签名跨 task 一致;`routeDesign(workspaceRoot)` 在 Task 4 加入;`action.name`/`dispatchCmd`/`payload.mode`/`reviewers[].name` 在 Task 6 SKILL 与 Task 2/3 router 输出字段名一致。✅

---

## Execution Handoff

计划已保存到 `docs/superpowers/plans/2026-07-10-feature-design-router.md`。两种执行方式:

1. **Subagent-Driven(推荐)** — 每个 task 派发独立 subagent,任务间两阶段评审,迭代快。
2. **Inline Execution** — 在当前会话用 executing-plans 批量执行 + 检查点。

选哪种?
