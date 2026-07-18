# Feature Design 重构 — Batch 3 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 Batch 1/2 的设计流程补齐 design change 能力（`design_change` type + `reopen` 命令），并删除旧 Agent Team 运行路径（router/dispatch/review-state/teammate-conduct），更新 guard/hooks/CLAUDE.md。

**Architecture:** `devsphere-design.js` 加 `reopen`（bump version / 清 baseline / 重置 ready / 写 design-change blocking），`devsphere-decisions.js` 加 `design_change` type。清理按"先解耦再删"：改写 `feature-workflow.resolveDesigning` 与 `review-matrix.setArtifactStatus` 去掉对 router/review-state 的依赖 → 删四个旧脚本 + teammate-conduct skill + 旧测试 → 改 guard/hooks → 清 stage skills/agents/CLAUDE.md。

**Tech Stack:** Node.js（仅 `fs`/`path`/`crypto`），`node:test`，CommonJS，无依赖。

## Global Constraints

- 无 `package.json`、无构建。脚本 dual-use（CLI + `require()`）。
- 测试 `node:test` + `node:assert`，在 `scripts/test/`。**跑全套用 `node --test 'scripts/test/**/*.test.js'`**。
- Skill 文档中文，交互用 `AskUserQuestion`。
- State 写入只经 `devsphere-state.js`；artifact 只经 `publish`；review matrix 经 review-matrix CLI / `record-review`；gate 经 `record-gate`。
- 不启用 Agent Teams；不引入 Agent runtime。
- Draft 用最终 Artifact frontmatter（`artifactId`+`version`）。Gate/Review/Baseline 绑 `artifactId + version + sha256(draft)`。
- Git 提交前缀：`feat(design):`/`fix(design):`/`refactor(design):`/`test(design):`/`docs(design):`。
- Snapshot 的 `artifactId` = slug（如 `solution-design`），不是 frontmatter id。

---

## File Structure

**修改：**
- `scripts/devsphere-decisions.js` — `VALID_TYPES` 加 `design_change`；校验 reason/impact。
- `scripts/devsphere-design.js` — 加 `bumpVersionMinor` + `reopen` + CLI `reopen`。
- `scripts/workflows/feature-workflow.js` — `resolveDesigning` 改为返回 `run_skill: feature-design`；删 router/review-state import。
- `scripts/devsphere-review-matrix.js` — `setArtifactStatus` 去掉 review-state 依赖；`readArtifactVersion` 用 `parseDraftFrontmatter`。
- `scripts/devsphere-guard.js` — 删 `check-teammate-decisions` case；改 review-writes/review-bash 提示。
- `hooks/hooks.json` — 删 `check-teammate-decisions` hook。
- 四个 `skills/feature-design-*/SKILL.md` — 删 teammate-conduct 否定句。
- `agents/*.md` — 清 Agent 身份/teammate-conduct/设计所有权。
- `CLAUDE.md` — §93-101/§140/§171 重写。
- `scripts/test/skill-contracts.test.js` — reconcile 旧机制相关断言。

**删除：**
- `scripts/feature-design-router.js` + `scripts/test/feature-design-router.test.js`
- `scripts/devsphere-dispatch.js` + `scripts/test/devsphere-dispatch.test.js`
- `scripts/devsphere-review-state.js` + `scripts/test/devsphere-review-state.test.js`
- `skills/devsphere-teammate-conduct/`（整目录）
- `scripts/test/feature-workflow-decisions.test.js`（绑定旧 router；若含 decisions schema 通用断言则迁移到 `devsphere-decisions.test.js`）

**新增：**
- `scripts/test/devsphere-design-batch3.test.js` — design_change + reopen 单元测试。
- `scripts/test/devsphere-design-batch3-e2e.test.js` — reopen 端到端。

**接口契约：**

```js
// scripts/devsphere-decisions.js
const VALID_TYPES = ['gated', 'autonomous', 'assumption', 'design_change'];
// design_change 校验：reason 必填、impact 必填（逗号分隔阶段）；不要求 options/askMode/rationale。

// scripts/devsphere-design.js
function bumpVersionMinor(draftFilePath)   // 读 frontmatter version，minor+1，写回；返回新 version 字符串
function reopen(taskPath, stage, decisionId) // → { reopenedStages, newVersions }
// reopen 固定下游表
const REOPEN_SCOPE = {
  businessDesign: ['businessDesign','solutionDesign','implementationDesign','testDesign'],
  solutionDesign: ['solutionDesign','implementationDesign','testDesign'],
  implementationDesign: ['implementationDesign','testDesign'],
  testDesign: ['testDesign'],
};
```

---

### Task 1: `design_change` decision type

**Files:**
- Modify: `scripts/devsphere-decisions.js`（`VALID_TYPES`、`validateDecisionElement`、`addDecision`）
- Test: `scripts/test/devsphere-design-batch3.test.js`（新建）

**Interfaces:**
- Produces: `addDecision({type:'design_change', category, summary, reason, impact})` 合法；`validateDecisionElement` 对 design_change 强校验 reason/impact 必填、不要求 options/askMode/rationale。
- Consumes: 无。

- [ ] **Step 1: 写失败测试**

新建 `scripts/test/devsphere-design-batch3.test.js`：

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeTask } = require('./helpers');
const { initDecisions, addDecision, validateDecisionElement } = require('../devsphere-decisions');

test('design_change type 合法：带 reason/impact', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  const d = addDecision(taskPath, 'business-design', {
    type: 'design_change', category: 'feature_scope',
    summary: '调整查询接口为异步',
    reason: '同步无法满足数据规模',
    impact: 'solutionDesign,implementationDesign,testDesign',
  });
  assert.strictEqual(d.type, 'design_change');
  assert.strictEqual(d.status, 'pending');
  assert.strictEqual(d.impact, 'solutionDesign,implementationDesign,testDesign');
});

test('design_change 缺 reason → 抛', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  assert.throws(() => addDecision(taskPath, 'business-design', {
    type: 'design_change', category: 'feature_scope', summary: 'x', impact: 'solutionDesign',
  }), /reason/);
});

test('design_change 缺 impact → 抛', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  assert.throws(() => addDecision(taskPath, 'business-design', {
    type: 'design_change', category: 'feature_scope', summary: 'x', reason: 'r',
  }), /impact/);
});

test('validateDecisionElement: design_change 不要求 options/rationale', () => {
  assert.doesNotThrow(() => validateDecisionElement({
    id: 'BD-DEC-001', type: 'design_change', category: 'feature_scope', status: 'pending',
    summary: 'x', reason: 'r', impact: 'solutionDesign', resolution: null, evidence: [],
  }));
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test scripts/test/devsphere-design-batch3.test.js`
Expected: FAIL — `Invalid decision type: design_change`。

- [ ] **Step 3: 加 type + 校验**

`scripts/devsphere-decisions.js`：

```js
const VALID_TYPES = ['gated', 'autonomous', 'assumption', 'design_change'];
```

在 `validateDecisionElement` 的 `if (d.type === 'gated') {...}` 之后加：

```js
  if (d.type === 'design_change') {
    if (typeof d.reason !== 'string' || !d.reason.trim()) {
      throw new Error('design_change decision reason 必填');
    }
    if (typeof d.impact !== 'string' || !d.impact.trim()) {
      throw new Error('design_change decision impact 必填');
    }
  }
```

在 `addDecision` 的 gated 校验块之后加：

```js
  if (input.type === 'design_change') {
    if (typeof input.reason !== 'string' || !input.reason.trim()) {
      throw new Error('design_change requires reason');
    }
    if (typeof input.impact !== 'string' || !input.impact.trim()) {
      throw new Error('design_change requires impact');
    }
  }
```

并在 `addDecision` 构造 `decision` 对象时追加字段（与 rationale 等并列）：

```js
    reason: input.type === 'design_change' ? input.reason : (input.rationale || ''),
    impact: input.type === 'design_change' ? input.impact : (input.impact || ''),
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test scripts/test/devsphere-design-batch3.test.js`
Expected: PASS。

- [ ] **Step 5: 跑全套确认无回归**

Run: `node --test 'scripts/test/**/*.test.js'`
Expected: 全绿。

- [ ] **Step 6: 提交**

```bash
git add scripts/devsphere-decisions.js scripts/test/devsphere-design-batch3.test.js
git commit -m "feat(design): add design_change decision type (reason/impact)"
```

---

### Task 2: `reopen` 命令

**Files:**
- Modify: `scripts/devsphere-design.js`（加 `bumpVersionMinor` + `REOPEN_SCOPE` + `reopen` + CLI）
- Test: `scripts/test/devsphere-design-batch3.test.js`（追加）

**Interfaces:**
- Produces: `bumpVersionMinor(draftFilePath) → '<newVersion>'`（minor+1，写回 frontmatter）；`reopen(taskPath, stage, decisionId) → { reopenedStages, newVersions }`。
- Consumes: Task 1 的 `design_change` type；既有 `STAGE_SLUG`/`draftPath`/`stageDir`/`progressPath`/`readDraftRef`；`devsphere-decisions.readDecisions`；`devsphere-review-matrix.readMatrix`/`writeMatrix`/`ensureIssuesList`/`nextIssueId`/`recomputeCounts`；`devsphere-state.readState`/`writeState`。

- [ ] **Step 1: 写失败测试**

追加到 `scripts/test/devsphere-design-batch3.test.js`：

```js
const fs = require('fs');
const path = require('path');
const {
  reopen, bumpVersionMinor, initStage, markReady, inspect, recordGate,
  publish, draftPath, STAGE_SLUG,
} = require('../devsphere-design');
const { initDecisions, addDecision, resolveDecision } = require('../devsphere-decisions');
const { initMatrix, readMatrix } = require('../devsphere-review-matrix');
const { readState } = require('../devsphere-state');

function baseline(taskPath, stage) {
  initStage(taskPath, stage);
  markReady(taskPath, stage, 'analysis');
  markReady(taskPath, stage, 'discovery');
  const slug = STAGE_SLUG[stage];
  fs.writeFileSync(draftPath(taskPath, stage),
    `---\nartifactId: "${slug.toUpperCase()}-1"\nversion: "0.1.0"\n---\n\n# d\n`, 'utf-8');
  recordGate(taskPath, stage, 'pass', { templateChecks: [], qualityChecks: [] });
  initMatrix(taskPath);
  const draftRef = require('../devsphere-design').readDraftRef(taskPath, stage);
  const m = readMatrix(taskPath);
  m.artifacts[slug].draftRef = draftRef;
  m.artifacts[slug].status = 'reviewed';
  require('../devsphere-review-matrix').writeMatrix(taskPath, m);
  publish(taskPath, stage);
}

test('bumpVersionMinor: 0.1.0 → 0.2.0，写回 frontmatter', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'businessDesign');
  const dp = draftPath(taskPath, 'businessDesign');
  fs.writeFileSync(dp, '---\nartifactId: "BD-1"\nversion: "0.1.0"\n---\n\nbody\n', 'utf-8');
  const v = bumpVersionMinor(dp);
  assert.strictEqual(v, '0.2.0');
  const body = fs.readFileSync(dp, 'utf-8');
  assert.ok(body.includes('version: "0.2.0"'));
});

test('reopen: business design_change 重开四阶段 + 写 design-change blocking', () => {
  const { taskPath, taskId } = makeTask();
  // 先基线 business
  baseline(taskPath, 'businessDesign');
  // 写 design_change decision 并批准
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  const d = addDecision(taskPath, 'business-design', {
    type: 'design_change', category: 'feature_scope', summary: '改需求',
    reason: '规模变化', impact: 'businessDesign,solutionDesign,implementationDesign,testDesign',
  });
  resolveDecision(taskPath, 'business-design', d.id, { chosen: 'apply', decidedAt: 't' });

  const res = reopen(taskPath, 'businessDesign', d.id);
  assert.deepStrictEqual(res.reopenedStages,
    ['businessDesign', 'solutionDesign', 'implementationDesign', 'testDesign']);
  assert.strictEqual(res.newVersions.businessDesign, '0.2.0');

  // baseline 已清
  const state = readState(taskPath);
  assert.ok(!state.stages.businessDesign.baseline);
  // progress 重置
  const prog = JSON.parse(fs.readFileSync(
    path.join(taskPath, 'work', 'business-design', 'progress.json'), 'utf-8'));
  assert.strictEqual(prog.ready.analysis, false);
  assert.strictEqual(prog.ready.discovery, false);
  // matrix 有 design-change blocking
  const m = readMatrix(taskPath);
  const entry = m.artifacts['business-design'];
  const dcBlocking = entry.issuesList.find(i => i.reviewerAgent === 'design-change');
  assert.ok(dcBlocking, 'design-change blocking 未写入');
  assert.strictEqual(dcBlocking.status, 'open');
  assert.ok(dcBlocking.source.includes(d.id));
});

test('reopen: 未批准的 design_change → 抛', () => {
  const { taskPath, taskId } = makeTask();
  baseline(taskPath, 'businessDesign');
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  const d = addDecision(taskPath, 'business-design', {
    type: 'design_change', category: 'feature_scope', summary: 'x', reason: 'r', impact: 'businessDesign',
  }); // pending，未 resolve
  assert.throws(() => reopen(taskPath, 'businessDesign', d.id), /apply|decided/i);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test scripts/test/devsphere-design-batch3.test.js`
Expected: FAIL — `reopen is not a function`。

- [ ] **Step 3: 实现 bumpVersionMinor + reopen**

`scripts/devsphere-design.js` 顶部 require 区确认/追加：

```js
const { readDecisions } = require('./devsphere-decisions');
const {
  readMatrix, writeMatrix, ensureIssuesList, nextIssueId, recomputeCounts,
} = require('./devsphere-review-matrix');
```

（若 `ensureIssuesList`/`nextIssueId`/`recomputeCounts` 未导出，在 `devsphere-review-matrix.js` 的 `module.exports` 追加它们。）

实现：

```js
const REOPEN_SCOPE = {
  businessDesign: ['businessDesign', 'solutionDesign', 'implementationDesign', 'testDesign'],
  solutionDesign: ['solutionDesign', 'implementationDesign', 'testDesign'],
  implementationDesign: ['implementationDesign', 'testDesign'],
  testDesign: ['testDesign'],
};

function bumpVersionMinor(draftFilePath) {
  let raw = fs.readFileSync(draftFilePath, 'utf-8');
  const m = raw.match(/^version:\s*"?(\d+)\.(\d+)\.(\d+)"?/m);
  if (!m) throw new Error(`无法从 ${draftFilePath} 读取 version`);
  const major = parseInt(m[1], 10);
  const minor = parseInt(m[2], 10) + 1;
  const newVer = `${major}.${minor}.0`;
  raw = raw.replace(/^version:\s*"?[0-9.]+"?/m, `version: "${newVer}"`);
  fs.writeFileSync(draftFilePath, raw, 'utf-8');
  return newVer;
}

function reopen(taskPath, stage, decisionId) {
  const slug = STAGE_SLUG[stage];
  if (!slug) throw new Error(`Unknown stage: ${stage}`);
  const scope = REOPEN_SCOPE[stage];
  if (!scope) throw new Error(`Stage not reopenable: ${stage}`);

  // 校验 design_change decision 已批准
  const decisionsFile = readDecisions(taskPath, slug);
  if (!decisionsFile) throw new Error(`decisions 文件未初始化: ${slug}`);
  const decision = (decisionsFile.decisions || []).find(d => d.id === decisionId);
  if (!decision) throw new Error(`decision 未找到: ${decisionId}`);
  if (decision.type !== 'design_change') throw new Error(`decision 非 design_change: ${decisionId}`);
  if (decision.status !== 'decided' || !(decision.resolution && decision.resolution.chosen === 'apply')) {
    throw new Error(`design_change 未批准(需 status=decided, resolution.chosen=apply): ${decisionId}`);
  }

  const newVersions = {};
  for (const s of scope) {
    const dp = draftPath(taskPath, s);
    if (!fs.existsSync(dp)) throw new Error(`draft 不存在: ${s}`);
    newVersions[s] = bumpVersionMinor(dp);
    // 清 baseline
    const state = readState(taskPath);
    if (state.stages && state.stages[s]) delete state.stages[s].baseline;
    writeState(taskPath, state);
    // 重置 progress（integratedDesign 跳过）
    if (s !== 'integratedDesign') {
      writeJSON(progressPath(taskPath, s), { step: 'analyze', ready: { analysis: false, discovery: false } });
    }
  }

  // 目标阶段写 design-change blocking
  const matrix = readMatrix(taskPath);
  if (!matrix || !matrix.artifacts || !matrix.artifacts[slug]) {
    throw new Error(`matrix entry 缺失: ${slug}`);
  }
  const entry = matrix.artifacts[slug];
  const draftRef = readDraftRef(taskPath, stage);
  entry.draftRef = draftRef;
  entry.status = 'pending';
  const list = ensureIssuesList(entry);
  const maxRound = list.reduce((mx, i) => Math.max(mx, i.round || 1), 0);
  list.push({
    id: nextIssueId(entry, 'blocking'),
    type: 'blocking',
    reviewerAgent: 'design-change',
    status: 'open',
    round: maxRound + 1,
    humanDecision: 'pending',
    closureEvidence: '',
    source: `${slug}@${newVersions[stage]}:design-change:${decisionId}`,
    note: decision.summary,
  });
  recomputeCounts(entry);
  writeMatrix(taskPath, matrix);

  return { reopenedStages: scope, newVersions };
}
```

把 `bumpVersionMinor`、`reopen`、`REOPEN_SCOPE` 加入 `module.exports`。CLI `main()` switch 加：

```js
      case 'reopen': {
        const [taskPath, stage, decisionId] = args;
        process.stdout.write(JSON.stringify(reopen(taskPath, stage, decisionId)));
        break;
      }
```

> 注：`reopen` 把目标 entry.status 置回 'pending'（因为要重新 review）；draftRef 设为新 hash，确保 inspect 看到 design-change blocking 绑当前 draft。

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test scripts/test/devsphere-design-batch3.test.js`
Expected: PASS。

- [ ] **Step 5: 跑全套确认无回归**

Run: `node --test 'scripts/test/**/*.test.js'`
Expected: 全绿。

- [ ] **Step 6: 提交**

```bash
git add scripts/devsphere-design.js scripts/devsphere-review-matrix.js scripts/test/devsphere-design-batch3.test.js
git commit -m "feat(design): add reopen command (bump version + clear baseline + design-change blocking)"
```

---

### Task 3: reopen 端到端验收

**Files:**
- Test: `scripts/test/devsphere-design-batch3-e2e.test.js`（新建）

**Interfaces:**
- Consumes: Task 1/2 全部能力。

- [ ] **Step 1: 写端到端测试**

`scripts/test/devsphere-design-batch3-e2e.test.js`：

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { makeTask } = require('./helpers');
const {
  initStage, markReady, inspect, recordGate, publish, recordReview, reopen,
  draftPath, currentStage, STAGE_SLUG,
} = require('../devsphere-design');
const { initDecisions, addDecision, resolveDecision } = require('../devsphere-decisions');
const { initMatrix, readMatrix, writeMatrix } = require('../devsphere-review-matrix');
const { readState } = require('../devsphere-state');

function writeDraft(taskPath, stage, ver, body = '# d') {
  const slug = STAGE_SLUG[stage];
  fs.writeFileSync(draftPath(taskPath, stage),
    `---\nartifactId: "${slug.toUpperCase()}-1"\nversion: "${ver}"\n---\n\n${body}\n`, 'utf-8');
}

function baselineClean(taskPath, stage, ver, reviewer, findings = []) {
  const slug = STAGE_SLUG[stage];
  initStage(taskPath, stage);
  markReady(taskPath, stage, 'analysis');
  markReady(taskPath, stage, 'discovery');
  writeDraft(taskPath, stage, ver);
  recordGate(taskPath, stage, 'pass', { templateChecks: [], qualityChecks: [] });
  recordReview(taskPath, stage,
    [{ reviewer, artifactId: slug, artifactVersion: ver, issueFindings: findings, closureDecisions: [] }]);
  assert.deepStrictEqual(inspect(taskPath, stage).nextAction, { kind: 'baseline' });
  publish(taskPath, stage);
}

test('E2E: business baseline → design_change → reopen → revise 关 blocking → 重 baseline → design_ready', () => {
  const { taskPath, taskId } = makeTask();

  // business 基线（单视角 SE，无 finding）
  baselineClean(taskPath, 'businessDesign', '0.1.0', 'se');
  // 其余三阶段 + integrated 基线到 design_ready（简化：每阶段单视角无 finding）
  baselineClean(taskPath, 'solutionDesign', '0.1.0', 'sa');
  baselineClean(taskPath, 'implementationDesign', '0.1.0', 'se');
  baselineClean(taskPath, 'testDesign', '0.1.0', 'sa');
  // integrated
  initStage(taskPath, 'integratedDesign');
  writeDraft(taskPath, 'integratedDesign', '0.1.0');
  recordGate(taskPath, 'integratedDesign', 'pass', { templateChecks: [], qualityChecks: [] });
  recordReview(taskPath, 'integratedDesign', [{
    reviewer: 'business-traceability', artifactId: 'integrated-design', artifactVersion: '0.1.0',
    issueFindings: [], closureDecisions: [],
  }, {
    reviewer: 'baseline-consistency', artifactId: 'integrated-design', artifactVersion: '0.1.0',
    issueFindings: [], closureDecisions: [],
  }]);
  publish(taskPath, 'integratedDesign');
  assert.strictEqual(currentStage(taskPath).complete, true);

  // 触发 design_change（business 范围）
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  const d = addDecision(taskPath, 'business-design', {
    type: 'design_change', category: 'feature_scope', summary: '改业务规则',
    reason: '用户反馈', impact: 'businessDesign,solutionDesign,implementationDesign,testDesign',
  });
  resolveDecision(taskPath, 'business-design', d.id, { chosen: 'apply', decidedAt: 't' });
  reopen(taskPath, 'businessDesign', d.id);

  // current-stage 回到 business（baseline 已清）
  assert.strictEqual(currentStage(taskPath).stage, 'businessDesign');
  // inspect 看到 design-change blocking → revise
  assert.strictEqual(inspect(taskPath, 'businessDesign').nextAction.kind, 'run_stage');
  assert.strictEqual(inspect(taskPath, 'businessDesign').nextAction.activity, 'revise');

  // 主会话判断"小改"→ 快进到 design + 改 draft（hash 变）
  markReady(taskPath, 'businessDesign', 'analysis');
  markReady(taskPath, 'businessDesign', 'discovery');
  writeDraft(taskPath, 'businessDesign', '0.2.0', '# business revised for design change');
  // record-gate（新 hash）
  recordGate(taskPath, 'businessDesign', 'pass', { templateChecks: [], qualityChecks: [] });
  // record-review：附 closureDecisions 关闭 design-change blocking
  const m = readMatrix(taskPath);
  const dcId = m.artifacts['business-design'].issuesList.find(i => i.reviewerAgent === 'design-change').id;
  recordReview(taskPath, 'businessDesign', [{
    reviewer: 'se', artifactId: 'business-design', artifactVersion: '0.2.0',
    issueFindings: [],
    closureDecisions: [{ issueId: dcId, status: 'closed', closureEvidence: 'design change 已在 draft 体现' }],
  }]);
  // blocking 关闭 + 新 hash 通过 → baseline
  assert.deepStrictEqual(inspect(taskPath, 'businessDesign').nextAction, { kind: 'baseline' });
  publish(taskPath, 'businessDesign');
  // business baseline 版本已是 0.2.0
  assert.strictEqual(readState(taskPath).stages.businessDesign.baseline.version, '0.2.0');
  // current-stage 推进到 solution（被重开）
  assert.strictEqual(currentStage(taskPath).stage, 'solutionDesign');
});
```

- [ ] **Step 2: 跑 E2E**

Run: `node --test scripts/test/devsphere-design-batch3-e2e.test.js`
Expected: PASS。若失败，定位：design-change blocking 的关闭是否经 `applyReviewResults` 的 closureDecisions 正确处理（参考 Batch 2 E2E 的 closure 模式）；version bump 后 draftRef 是否更新。

- [ ] **Step 3: 跑全套回归**

Run: `node --test 'scripts/test/**/*.test.js'`
Expected: 全绿。

- [ ] **Step 4: 提交**

```bash
git add scripts/test/devsphere-design-batch3-e2e.test.js
git commit -m "test(design): add reopen end-to-end (design_change → reopen → revise → re-baseline)"
```

---

### Task 4: 解开 feature-workflow + review-matrix 对旧脚本的依赖

**Files:**
- Modify: `scripts/workflows/feature-workflow.js`（`resolveDesigning` 改写 + 删 import）
- Modify: `scripts/devsphere-review-matrix.js`（`setArtifactStatus` 去 review-state；`readArtifactVersion` 内联）
- Test: `node --test 'scripts/test/**/*.test.js'`（确认改完仍绿，旧 router 测试此任务**暂不删**，下个任务删）

**Interfaces:**
- Produces: feature-workflow 的 designing 分支返回 `run_skill: feature-design`，不再 require router/review-state；review-matrix 不再 require review-state。
- Consumes: 既有 `makeAction`、`devsphere-design.parseDraftFrontmatter`。

- [ ] **Step 1: 改写 feature-workflow.resolveDesigning**

`scripts/workflows/feature-workflow.js` 顶部删掉：

```js
const { readArtifactVersion, getReviewStatus } = require('../devsphere-review-state');
const { stageToArtifact } = require('../feature-design-router');
```

（若别处用到 `stageToArtifact`，改用 `require('../devsphere-design').STAGE_SLUG`。）

把 `if (status === 'designing') { return resolveDesigning(...); }` 改为：

```js
  if (status === 'designing') {
    return makeAction('run_skill', state, 'design', null,
      'feature-design', {}, [],
      '设计阶段：由 feature-design skill（生命周期入口）驱动。',
      [], []);
  }
```

删除 `resolveDesigning` 函数整体（约第 122 行起）。删掉文件中对 `stageToArtifact`/`readArtifactVersion`/`getReviewStatus` 的全部引用（grep 确认清零）。

- [ ] **Step 2: 改写 review-matrix.setArtifactStatus 去 review-state**

`scripts/devsphere-review-matrix.js`：

把 `setArtifactStatus` 中两处 `require('./devsphere-review-state')` 的 `readArtifactVersion`/`getReviewStatus` 用法替换。新流程下"reviewer 完成"由 `record-review` 的 stamp 保证，`setArtifactStatus` 不再校验 reviewer 快照完成度，只保留 blocking/pending/apply 校验：

```js
function setArtifactStatus(taskPath, artifact, status) {
  const matrix = readMatrix(taskPath);
  if (!matrix || !matrix.artifacts || !matrix.artifacts[artifact]) {
    throw new Error(`Unknown artifact: ${artifact}`);
  }
  const entry = matrix.artifacts[artifact];
  if (status !== 'pending') {
    recomputeCounts(entry);
    const pending = getPendingHumanDecisions(matrix, artifact);
    if (entry.issues.blocking > 0) {
      throw new Error(`Cannot set status '${status}': ${entry.issues.blocking} open blocking issue(s) remain`);
    }
    if (pending.length > 0) {
      throw new Error(`Cannot set status '${status}': ${pending.length} pending advisory/risk decision(s) remain`);
    }
    const openApply = getOpenApplyItems(matrix, artifact);
    if (openApply.length > 0) {
      throw new Error(`Cannot set status '${status}': ${openApply.length} apply revision issue(s) remain open`);
    }
  }
  entry.status = status;
  if (status === 'reviewed') {
    const { parseDraftFrontmatter } = require('./devsphere-design');
    const ap = path.join(taskPath, 'artifacts', `${artifact}.md`);
    const fm = parseDraftFrontmatter(ap);
    entry.reviewedVersion = fm ? fm.version : null;
  } else if (status === 'pending') {
    entry.reviewedVersion = null;
  }
  writeMatrix(taskPath, matrix);
  return { artifact, status: entry.status, issues: entry.issues };
}
```

> 注：`setArtifactStatus` 新流程下不再是评审完成的主路径（`record-review` 直接 stamp），但保留为工具/CLI，校验逻辑去 review-state 化。`path` 需在文件顶部 require（若未有）。

- [ ] **Step 3: 确认 review-matrix 不再 require review-state**

Run: `grep -n "devsphere-review-state" scripts/devsphere-review-matrix.js`
Expected: 无命中。若有残留 require，删除。

- [ ] **Step 4: 跑全套（旧 router/review-state 脚本仍在，但 feature-workflow/matrix 已不依赖它们）**

Run: `node --test 'scripts/test/**/*.test.js'`
Expected: 全绿。若 `feature-workflow-decisions.test.js` 因 `resolveDesigning` 删除而失败，该测试整体删除（绑定旧 router，Batch 3 不保留）；若它含 decisions schema 通用断言，迁移到 `devsphere-decisions.test.js` 后再删。

- [ ] **Step 5: 提交**

```bash
git add scripts/workflows/feature-workflow.js scripts/devsphere-review-matrix.js scripts/test/
git commit -m "refactor(design): decouple feature-workflow and review-matrix from legacy router/review-state"
```

---

### Task 5: 删除旧脚本/skill/测试 + guard/hooks 清理

**Files:**
- Delete: `scripts/feature-design-router.js`、`scripts/devsphere-dispatch.js`、`scripts/devsphere-review-state.js`、`scripts/test/feature-design-router.test.js`、`scripts/test/devsphere-dispatch.test.js`、`scripts/test/devsphere-review-state.test.js`、`skills/devsphere-teammate-conduct/`（整目录）、`scripts/test/feature-workflow-decisions.test.js`（若 Task 4 未删）
- Modify: `scripts/devsphere-guard.js`、`hooks/hooks.json`、`scripts/test/skill-contracts.test.js`

**Interfaces:**
- Produces: 旧机制文件全删；guard/hooks 不再引用 teammate/review-state；skill-contracts 无旧机制断言。

- [ ] **Step 1: 删旧脚本/skill/测试**

```bash
git rm scripts/feature-design-router.js scripts/devsphere-dispatch.js scripts/devsphere-review-state.js
git rm scripts/test/feature-design-router.test.js scripts/test/devsphere-dispatch.test.js scripts/test/devsphere-review-state.test.js
git rm -r skills/devsphere-teammate-conduct
# feature-workflow-decisions.test.js 若 Task 4 未删，此处删：
git rm scripts/test/feature-workflow-decisions.test.js 2>/dev/null || true
```

- [ ] **Step 2: 确认无残留引用**

Run:
```bash
grep -rln "feature-design-router\|devsphere-dispatch\|devsphere-review-state\|devsphere-teammate-conduct" skills/ scripts/ hooks/ agents/ CLAUDE.md
```
Expected: 无命中（命中处逐一清理：可能是 guard 提示文案、skill 引用、CLAUDE.md 段落）。记录剩余命中，在 Step 3-4 清理。

- [ ] **Step 3: 清 guard + hooks**

`hooks/hooks.json`：删 `check-teammate-decisions` 整条（Team​mateIdle hook）。

`scripts/devsphere-guard.js`：
- 删 `case 'check-teammate-decisions':` 整块。
- `check-review-writes` 提示（约 line 221）：`"...使用 Lead 的 review merge 或 devsphere-review-state.js complete 命令。"` → `"...使用 record-review CLI 合并评审结果。"`。
- `check-review-bash`（约 line 367/374）：`isReviewCLI = command.includes('devsphere-review-state.js')` → `command.includes('devsphere-design.js record-review') || command.includes('devsphere-review-matrix.js')`；提示文案 `"...devsphere-review-state.js complete..."` → `"...record-review CLI 合并，review-matrix CLI 维护 issue..."`。

- [ ] **Step 4: reconcile skill-contracts.test.js**

```bash
grep -n "router\|dispatch\|review-state\|teammate-conduct\|design-sa\|design-se" scripts/test/skill-contracts.test.js
```
命中处：删除或改为新流程等价断言。不得削弱对 decisions/evidence/review 写入边界的契约校验。

- [ ] **Step 5: 跑全套**

Run: `node --test 'scripts/test/**/*.test.js'`
Expected: 全绿。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "refactor(design): remove legacy router/dispatch/review-state/teammate-conduct + guard/hooks cleanup"
```

---

### Task 6: 清 stage skills 否定句 + agents + CLAUDE.md

**Files:**
- Modify: `skills/feature-design-business/SKILL.md`、`-solution`、`-implementation`、`-test`（删 teammate-conduct 否定句）
- Modify: `agents/sa.md`、`se.md`、`mde.md`、`tse.md`、`dev.md`、`cie.md`（清 Agent 身份/teammate-conduct/设计所有权，保留评审段）
- Modify: `CLAUDE.md`（§93-101、§140、§171、Agent invocation 段）
- Test: `node --test 'scripts/test/**/*.test.js'`（含 skill-contracts）

- [ ] **Step 1: 清 stage skills 否定句**

四个 `skills/feature-design-*/SKILL.md` 第 10 行附近的 `本 skill 不携带 … Agent 身份，不读取 workflow mode，不调用 \`devsphere-teammate-conduct\`，不自行 AskUserQuestion...` —— 删去"不调用 `devsphere-teammate-conduct`"片段（旧机制已不存在，否定句无意义），保留"不自行 AskUserQuestion"等仍有效的约束。

- [ ] **Step 2: 清 agents/*.md**

每个 agent 文件：
- 删 frontmatter `skills:` 里的 `devsphere-teammate-conduct`（及 `feature-design-*` 若已不再用 agent 执行设计）。
- 删"你是 scc-dev-sphere 插件中的 XX Agent"自我身份句；改为"本文件是 XX 视角的评审 profile 来源"。
- 删"## 产物责任 / 你拥有 artifacts/..."设计所有权段（设计由主会话 + stage skill 做）。
- **保留**"## 设计评审"段（它是 review profile，Batch 2 feature-review 用）。
- 保留知识查询指引、设计原则中对评审有用的部分。

- [ ] **Step 3: 重写 CLAUDE.md 设计阶段段落**

`CLAUDE.md`：
- §93-101（`### 设计阶段决策循环`）整段重写为：

```markdown
### 设计阶段生命周期

设计阶段由 `feature-design` skill（主会话生命周期入口）驱动：主会话读 `devsphere-design.js current-stage` 解析当前阶段 → `inspect` 拿 nextAction → 按动作执行（run_stage/ask_decision/ask_review/run_gate/run_review/baseline/complete）→ 重读 inspect。主会话承担分析/调查/设计推演（落 `work/<stage>/`）、Gate/Review 调度、用户交互；不创建长期 Agent。

四个设计环节（business/solution/implementation/test）共享 analyze→discover→design→validate→review→revise→baseline 生命周期；每阶段按固定评审视角表派发一次性 Review Subagent（各视角加载 `feature-review` job skill + 对应 `agents/*.md` 评审段），findings 经 `record-review` 合并到 review matrix，绑定 draft hash。integrated 走精简生命周期（assemble→gate→4 维度承接 review→baseline→design_ready）。

基线后设计变更：写 `design_change` decision → 用户批准 → `reopen`（bump version、清固定下游 baseline、重置 ready、写 design-change blocking）→ 主会话判断变更规模用 `mark-ready` 定起点 → revise 关闭 design-change blocking → 重 Gate/Review → 重 baseline。

守卫（确定性兜底）：`check-decisions-resolved`、`check-decisions-format`、`check-decisions-bash`、`check-review-writes`/`check-review-bash`（评审 matrix 只经 CLI）、`check-evidence-writes`/`-bash`、`check-clarify-checklist`/`-bash`。
```

- §140（`feature-design sub-orchestrator`）改为：`feature-design skill 是设计阶段生命周期入口，读 inspect 的 nextAction 执行。`
- §171（`Agent invocation`）改为：`agents/*.md 是各角色评审 checklist 的来源文档；默认流程不创建 Agent。设计由主会话 + stage skill 完成；评审由一次性 Review Subagent 加载 feature-review skill + 对应 agent profile 执行。`
- 同步更新 `## Commands`、`## Architecture` 中引用旧脚本命令的行（删 router/dispatch/review-state 命令示例，补 `devsphere-design.js <init-stage|mark-ready|inspect|record-gate|record-review|publish|current-stage|reopen>`）。

- [ ] **Step 4: 跑 skill-contracts + 全套**

Run: `node --test 'scripts/test/**/*.test.js'`
Expected: 全绿（若 skill-contracts 有 agents/stage-skill 形态断言，按新形态 reconcile）。

- [ ] **Step 5: 提交**

```bash
git add skills/ agents/ CLAUDE.md scripts/test/skill-contracts.test.js
git commit -m "docs(design): rewrite stage skills/agents/CLAUDE.md to lifecycle model (remove Agent residue)"
```

---

### Task 7: 全套回归 + grep 验证清理干净

**Files:**
- Test: 全套

- [ ] **Step 1: grep 验证旧机制无残留**

Run:
```bash
grep -rln "feature-design-router\|devsphere-dispatch\|devsphere-review-state\|devsphere-teammate-conduct\|design-sa\|design-se\|design-mde\|design-tse\|design-cie" skills/ scripts/ hooks/ agents/ CLAUDE.md
```
Expected: 无命中。命中处回到对应任务清理。

- [ ] **Step 2: 全套测试**

Run: `node --test 'scripts/test/**/*.test.js'`
Expected: 全绿（Batch 1/2/3 测试合计 ~240+）。

- [ ] **Step 3: 验证 workflow 进入设计阶段正常**

手动（或测试）：模拟 task status=designing，`feature-workflow.js` 返回 `run_skill: feature-design`（不再依赖 router）。

- [ ] **Step 4: 提交（若有清理漏网）**

```bash
git status   # 确认干净
```
若 Step 1-2 有补充清理，提交：`git commit -m "chore(design): final legacy-cleanup sweep"`。

---

## Self-Review

**1. Spec 覆盖：**
- B3-2（minor 递增）→ Task 2 `bumpVersionMinor` ✓
- B3-3（不复制 Draft，bump version）→ Task 2 reopen 不 copy、只 bump ✓
- B3-4（起点由主会话 mark-ready）→ Task 2 reopen 重置 ready=false；Task 3 E2E 演示 mark-ready 快进 ✓
- B3-5（design_change type）→ Task 1 ✓
- B3-6（design-change blocking + 主会话 closureDecisions 关闭）→ Task 2 写 blocking；Task 3 E2E 演示关闭 ✓
- B3-7（解耦 feature-workflow/review-matrix）→ Task 4 ✓
- B3-8（删 teammate/guard/hooks）→ Task 5 ✓
- B3-9（stage skills/agents/CLAUDE.md）→ Task 6 ✓

**2. 占位符扫描：** 各 step 均有完整代码或具体 grep 指令；§4.2/Task 4 的 setArtifactStatus 改写给了完整代码。无 TBD。

**3. 类型/命名一致性：**
- `reopen(taskPath, stage, decisionId) → {reopenedStages, newVersions}`，Task 2/3 一致 ✓
- `bumpVersionMinor(draftFilePath) → '<ver>'`，Task 2/3 一致 ✓
- `REOPEN_SCOPE` 键用 camelCase stage 名（businessDesign…），Task 2/3 一致 ✓
- design-change blocking `reviewerAgent='design-change'`、source 含 decisionId，Task 2/3 一致 ✓
- `record-review` snapshot artifactId=slug，Task 3 E2E 用 slug ✓（Batch 2 既定契约）

**实现时留意（非阻塞）：**
- `ensureIssuesList`/`nextIssueId`/`recomputeCounts` 是否已从 review-matrix 导出（Task 2 Step 3 要求确认/补导出）。
- Task 4 删 `resolveDesigning` 后，`feature-workflow-decisions.test.js` 可能整测失败（绑定旧 router）→ 删该测试文件或迁移通用断言。
- Task 5 grep 可能在 CLAUDE.md/agents 残留 → Task 6 清理；两任务顺序保证 Task 6 收尾。
- design-change blocking 关闭走 `applyReviewResults` 的 closureDecisions（Batch 2 机制），需 issueId 存在于当前 artifact 的 issuesList（reopen 已写入，绑定新 hash）。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-18-feature-design-refactor-batch3.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
