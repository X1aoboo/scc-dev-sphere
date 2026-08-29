# Feature Design 重构 — Batch 2 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Batch 1 的 business 垂直切片扩展到 Solution/Implementation/Test + Integrated Design，落地多视角并行评审（D3）与跨阶段承接评审（D4），推进 task 到 `design_ready`。

**Architecture:** 扩展现有聚合脚本 `scripts/devsphere-design.js`（新增 `current-stage` 解析器、`record-review` 合并 CLI、inspect 的 integrated 分支、init-stage 的 integrated 精简分支）。复用既有 `applyReviewResults` 做多视角合并。重构四个设计阶段 skill 为 activity 模型（analyze/discover/design/revise → `work/<stage>/`），重写 `feature-review` 为 Review Subagent job skill，扩展 `feature-design/SKILL.md` 编排多阶段 + 并行多视角派发 + integrated 组装 + design_ready。

**Tech Stack:** Node.js（仅 `fs`/`path`/`crypto`），`node:test`，CommonJS，无依赖。

## Global Constraints

- 无 `package.json`、无构建。脚本 dual-use（CLI + `require()`）。
- 测试用 `node:test` + `node:assert`，在 `scripts/test/`。**跑全套用 `node --test 'scripts/test/**/*.test.js'`**（NOT `node --test scripts/test/`）。
- Skill 文档中文，交互用 `AskUserQuestion`，遵循 `references/interaction-guidelines.md`。
- State 写入只经 `devsphere-state.js`；artifact 只经 `publish`；review matrix 经 review-matrix CLI / `record-review`；gate 经 `record-gate`。
- 不启用 Agent Teams；不引入 Agent runtime。
- Draft 用最终 Artifact frontmatter（`artifactId`+`version`），不写 `status: draft`。Gate/Review/Baseline 绑定 `artifactId + version + sha256(draft)`。
- Git 提交前缀：脚本/功能 `feat(design):`，重构 `refactor(design):`，测试 `test(design):`，文档 `docs(design):`。

---

## File Structure

**修改：**
- `scripts/devsphere-design.js` — STAGE_SLUG 加 integrated；init-stage integrated 精简分支；新增 `currentStage`、`recordReview`；inspect 加 integrated 分支 + activity `assemble`；publish 对 integrated 返回 `complete` 信号；CLI 加 `current-stage`、`record-review`。
- `skills/feature-design/SKILL.md` — 扩展为多阶段编排 + 多视角并行派发 + integrated 组装 + design_ready。
- `skills/feature-design-business/SKILL.md`、`skills/feature-design-solution/SKILL.md`、`skills/feature-design-implementation/SKILL.md`、`skills/feature-design-test/SKILL.md` — 重构为 activity 模型。
- `skills/feature-review/SKILL.md` — 重写为 Review Subagent job skill。
- `scripts/test/skill-contracts.test.js` — 如有断言与 stage skill 旧形态绑定，reconcile。

**新增：**
- `scripts/test/devsphere-design-batch2.test.js` — current-stage / record-review / inspect-integrated 单元测试。
- `scripts/test/devsphere-design-batch2-e2e.test.js` — 多阶段 + 多视角 + integrated 端到端。

**接口契约（跨任务引用）：**

```js
// scripts/devsphere-design.js 新增导出
const DESIGN_STAGE_ORDER = ['businessDesign','solutionDesign','implementationDesign','testDesign','integratedDesign'];
function currentStage(taskPath)         // → { stage: <stage>|null, complete: true|false }
function recordReview(taskPath, stage, snapshots)  // → applyReviewResults 返回值；副作用：stamp entry.draftRef/status
// inspect 对 integratedDesign 返回 run_stage/assemble 与 complete；其余 stage 行为不变
```

`recordReview` 的 `snapshots` shape（对齐 `applyReviewResults`）：

```json
[{ "reviewer": "se", "artifactId": "SD-1", "artifactVersion": "0.2.0",
   "issueFindings": [{ "findingId": "F1", "type": "blocking", "reviewerAgent": "se", "round": 1 }],
   "closureDecisions": [{ "issueId": "SD-B-001", "status": "closed", "closureEvidence": "..." }] }]
```

---

### Task 1: STAGE_SLUG 加 integrated + init-stage 精简分支

**Files:**
- Modify: `scripts/devsphere-design.js:11`（`STAGE_SLUG`）、`initStage`（约第 82 行）
- Test: `scripts/test/devsphere-design-batch2.test.js`（新建）

**Interfaces:**
- Produces: `STAGE_SLUG.integratedDesign = 'integrated-design'`；`initStage(taskPath, 'integratedDesign')` 只建 `work/integrated-design/draft.md`（不建 analysis/discovery/design，不建 progress.json）。
- Consumes: 无新依赖。

- [ ] **Step 1: 写失败测试**

新建 `scripts/test/devsphere-design-batch2.test.js`：

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { makeTask } = require('./helpers');
const { initStage, STAGE_SLUG, stageDir } = require('../devsphere-design');

test('STAGE_SLUG 含 integratedDesign', () => {
  assert.strictEqual(STAGE_SLUG.integratedDesign, 'integrated-design');
});

test('initStage(integratedDesign) 只建 draft.md，无 progress.json / analysis / discovery / design', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'integratedDesign');
  const dir = stageDir(taskPath, 'integratedDesign');
  assert.ok(fs.existsSync(path.join(dir, 'draft.md')));
  assert.ok(!fs.existsSync(path.join(dir, 'analysis.md')));
  assert.ok(!fs.existsSync(path.join(dir, 'discovery.md')));
  assert.ok(!fs.existsSync(path.join(dir, 'design.md')));
  assert.ok(!fs.existsSync(path.join(dir, 'progress.json')));
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test scripts/test/devsphere-design-batch2.test.js`
Expected: FAIL — `STAGE_SLUG.integratedDesign` 为 undefined → initStage 抛 `Unknown stage`。

- [ ] **Step 3: 改 STAGE_SLUG + initStage**

`scripts/devsphere-design.js` 第 11 行 `STAGE_SLUG` 加一行：

```js
const STAGE_SLUG = {
  businessDesign: 'business-design',
  solutionDesign: 'solution-design',
  implementationDesign: 'implementation-design',
  testDesign: 'test-design',
  integratedDesign: 'integrated-design',
};
```

`defaultDraftFrontmatter` 的 idPrefix 映射加 integrated（第 76 行附近）：

```js
const idPrefix = { 'business-design': 'BD', 'solution-design': 'SD', 'implementation-design': 'ID', 'test-design': 'TD', 'integrated-design': 'INT' }[STAGE_SLUG[stage]] || 'X';
```

`initStage` 在 `fs.mkdirSync(dir, ...)` 之后、`WORK_TEMPLATES` 循环之前加 integrated 分支：

```js
function initStage(taskPath, stage) {
  if (!STAGE_SLUG[stage]) throw new Error(`Unknown stage: ${stage}`);
  const dir = stageDir(taskPath, stage);
  fs.mkdirSync(dir, { recursive: true });

  if (stage === 'integratedDesign') {
    const dp = path.join(dir, 'draft.md');
    if (!fs.existsSync(dp)) fs.writeFileSync(dp, defaultDraftFrontmatter(taskPath, stage), 'utf-8');
    return { dir };
  }

  for (const [name, rel] of Object.entries(WORK_TEMPLATES)) {
    // ...既有模板复制逻辑不变...
  }
  // ...既有 draft.md + progress.json 逻辑不变...
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test scripts/test/devsphere-design-batch2.test.js`
Expected: PASS。

- [ ] **Step 5: 跑全套确认无回归**

Run: `node --test 'scripts/test/**/*.test.js'`
Expected: 全绿（Batch 1 测试不受影响）。

- [ ] **Step 6: 提交**

```bash
git add scripts/devsphere-design.js scripts/test/devsphere-design-batch2.test.js
git commit -m "feat(design): add integrated stage slug + minimal init-stage"
```

---

### Task 2: `current-stage` 解析器

**Files:**
- Modify: `scripts/devsphere-design.js`（加 `DESIGN_STAGE_ORDER`、`currentStage`、CLI `current-stage`）
- Test: `scripts/test/devsphere-design-batch2.test.js`（追加）

**Interfaces:**
- Produces: `currentStage(taskPath) → { stage, complete }`。顺序遍历 `DESIGN_STAGE_ORDER`，首个无 `state.stages[stage].baseline` 的即当前阶段；全有 → `{stage:null, complete:true}`。
- Consumes: `readState`（来自 `devsphere-state`，已在文件顶部 require）。

- [ ] **Step 1: 写失败测试**

追加到 `scripts/test/devsphere-design-batch2.test.js`：

```js
const { currentStage } = require('../devsphere-design');
const { readState, writeState } = require('../devsphere-state');

function baselineStage(taskPath, stage, hash) {
  const state = readState(taskPath);
  state.stages[stage] = state.stages[stage] || {};
  state.stages[stage].baseline = { version: '0.1.0', hash: hash || 'sha256:x', inputVersions: {}, approvedAt: 't' };
  writeState(taskPath, state);
}

test('current-stage: 全无 baseline → businessDesign', () => {
  const { taskPath } = makeTask();
  assert.strictEqual(currentStage(taskPath).stage, 'businessDesign');
  assert.strictEqual(currentStage(taskPath).complete, false);
});

test('current-stage: business baseline 后 → solutionDesign', () => {
  const { taskPath } = makeTask();
  baselineStage(taskPath, 'businessDesign');
  assert.strictEqual(currentStage(taskPath).stage, 'solutionDesign');
});

test('current-stage: 四阶段全 baseline → integratedDesign', () => {
  const { taskPath } = makeTask();
  for (const s of ['businessDesign','solutionDesign','implementationDesign','testDesign']) {
    baselineStage(taskPath, s);
  }
  assert.strictEqual(currentStage(taskPath).stage, 'integratedDesign');
  assert.strictEqual(currentStage(taskPath).complete, false);
});

test('current-stage: 含 integrated baseline → complete', () => {
  const { taskPath } = makeTask();
  for (const s of ['businessDesign','solutionDesign','implementationDesign','testDesign','integratedDesign']) {
    baselineStage(taskPath, s);
  }
  assert.strictEqual(currentStage(taskPath).stage, null);
  assert.strictEqual(currentStage(taskPath).complete, true);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test scripts/test/devsphere-design-batch2.test.js`
Expected: FAIL — `currentStage is not a function`。

- [ ] **Step 3: 实现 currentStage**

`scripts/devsphere-design.js` 顶部（STAGE_SLUG 之后）加：

```js
const DESIGN_STAGE_ORDER = ['businessDesign', 'solutionDesign', 'implementationDesign', 'testDesign', 'integratedDesign'];

function currentStage(taskPath) {
  const state = readState(taskPath);
  if (!state || !state.stages) return { stage: null, complete: false };
  for (const stage of DESIGN_STAGE_ORDER) {
    const sd = state.stages[stage];
    if (!sd || !sd.baseline) return { stage, complete: false };
  }
  return { stage: null, complete: true };
}
```

把 `DESIGN_STAGE_ORDER`、`currentStage` 加入 `module.exports`。CLI `main()` switch 加：

```js
      case 'current-stage': {
        const [taskPath] = args;
        process.stdout.write(JSON.stringify(currentStage(taskPath)));
        break;
      }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test scripts/test/devsphere-design-batch2.test.js`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add scripts/devsphere-design.js scripts/test/devsphere-design-batch2.test.js
git commit -m "feat(design): add current-stage resolver"
```

---

### Task 3: inspect 的 integrated 分支

**Files:**
- Modify: `scripts/devsphere-design.js`（`inspect` 函数，约第 159 行）
- Test: `scripts/test/devsphere-design-batch2.test.js`（追加）

**Interfaces:**
- Produces: `inspect(taskPath, 'integratedDesign')` 返回精简里程碑序列——无 draft → `{kind:'run_stage', activity:'assemble'}`；drafted→run_gate；gate fail→revise；validated→run_review；reviewed→baseline；baselined→`{kind:'complete'}`。跳过 analyze/discover 的 progress.json 检查。
- Consumes: Task 1 的 `STAGE_SLUG.integratedDesign`；既有 `readDraftRef`/`readGate`/`gateAcceptable`/`reviewAcceptable`/`readState`。

- [ ] **Step 1: 写失败测试**

追加到 `scripts/test/devsphere-design-batch2.test.js`：

```js
const { inspect, recordGate, initStage } = require('../devsphere-design');
const { initMatrix, readMatrix, writeMatrix } = require('../devsphere-review-matrix');

function writeIntegratedDraft(taskPath, id, ver, body = '# integrated') {
  const dp = path.join(taskPath, 'work', 'integrated-design', 'draft.md');
  fs.writeFileSync(dp, `---\nartifactId: "${id}"\nversion: "${ver}"\n---\n\n${body}\n`, 'utf-8');
}

test('inspect(integrated): 无 draft → run_stage/assemble', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'integratedDesign');
  assert.deepStrictEqual(inspect(taskPath, 'integratedDesign').nextAction, { kind: 'run_stage', activity: 'assemble' });
});

test('inspect(integrated): draft 存在无 gate → run_gate', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'integratedDesign');
  writeIntegratedDraft(taskPath, 'INT-1', '0.1.0');
  assert.deepStrictEqual(inspect(taskPath, 'integratedDesign').nextAction, { kind: 'run_gate' });
});

test('inspect(integrated): gate pass 无 review → run_review', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'integratedDesign');
  writeIntegratedDraft(taskPath, 'INT-1', '0.1.0');
  recordGate(taskPath, 'integratedDesign', 'pass', { templateChecks: [], qualityChecks: [] });
  assert.deepStrictEqual(inspect(taskPath, 'integratedDesign').nextAction, { kind: 'run_review' });
});

test('inspect(integrated): reviewed 无 baseline → baseline', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'integratedDesign');
  writeIntegratedDraft(taskPath, 'INT-1', '0.1.0');
  recordGate(taskPath, 'integratedDesign', 'pass', { templateChecks: [], qualityChecks: [] });
  initMatrix(taskPath); // 含 integrated-design entry（BASE_REVIEWERS 已含）
  const draftRef = require('../devsphere-design').readDraftRef(taskPath, 'integratedDesign');
  const m = readMatrix(taskPath);
  m.artifacts['integrated-design'].draftRef = draftRef;
  m.artifacts['integrated-design'].status = 'reviewed';
  writeMatrix(taskPath, m);
  assert.deepStrictEqual(inspect(taskPath, 'integratedDesign').nextAction, { kind: 'baseline' });
});

test('inspect(integrated): baselined → complete', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'integratedDesign');
  writeIntegratedDraft(taskPath, 'INT-1', '0.1.0');
  recordGate(taskPath, 'integratedDesign', 'pass', { templateChecks: [], qualityChecks: [] });
  // 模拟 publish 已写 baseline
  const { readState, writeState } = require('../devsphere-state');
  const state = readState(taskPath);
  state.stages.integratedDesign = state.stages.integratedDesign || {};
  state.stages.integratedDesign.baseline = { version: '0.1.0', hash: require('../devsphere-design').readDraftRef(taskPath, 'integratedDesign').hash, inputVersions: {}, approvedAt: 't' };
  writeState(taskPath, state);
  initMatrix(taskPath);
  const m = readMatrix(taskPath);
  m.artifacts['integrated-design'].draftRef = state.stages.integratedDesign.baseline;
  m.artifacts['integrated-design'].status = 'reviewed';
  writeMatrix(taskPath, m);
  assert.deepStrictEqual(inspect(taskPath, 'integratedDesign').nextAction, { kind: 'complete' });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test scripts/test/devsphere-design-batch2.test.js`
Expected: FAIL — inspect(integrated) 当前会因无 progress.json 返回 run_stage/analyze，而非 assemble。

- [ ] **Step 3: 给 inspect 加 integrated 分支**

在 `inspect` 函数体最前面（`const slug = STAGE_SLUG[stage];` 之后、读取 prog 之前）插入：

```js
function inspect(taskPath, stage) {
  const slug = STAGE_SLUG[stage];
  if (!slug) return { stage, nextAction: { kind: 'blocked', reason: `Unknown stage: ${stage}` } };

  if (stage === 'integratedDesign') {
    const draftRef = readDraftRef(taskPath, stage);
    if (!draftRef) return { stage, milestone: 'not_started', nextAction: { kind: 'run_stage', activity: 'assemble' } };
    const gate = readGate(taskPath, stage);
    if (gate && gate.draftRef && gate.draftRef.hash === draftRef.hash && gate.status === 'fail') {
      return { stage, milestone: 'drafted', draftRef, gate, nextAction: { kind: 'run_stage', activity: 'revise', reason: 'gate fail' } };
    }
    if (!gateAcceptable(gate, draftRef)) {
      return { stage, milestone: 'drafted', draftRef, nextAction: { kind: 'run_gate' } };
    }
    const matrix = readMatrix(taskPath);
    const rev = reviewAcceptable(matrix, slug, draftRef);
    if (rev.hasOpenRevision) {
      return { stage, milestone: 'validated', draftRef, gate, nextAction: { kind: 'run_stage', activity: 'revise', reason: 'open review items' } };
    }
    if (!rev.complete) {
      return { stage, milestone: 'validated', draftRef, gate, nextAction: { kind: 'run_review' } };
    }
    const state = readState(taskPath) || {};
    const baseline = state.stages && state.stages[stage] && state.stages[stage].baseline;
    if (!baseline || baseline.hash !== draftRef.hash) {
      return { stage, milestone: 'reviewed', draftRef, gate, nextAction: { kind: 'baseline' } };
    }
    return { stage, milestone: 'baselined', draftRef, gate, baseline, nextAction: { kind: 'complete' } };
  }

  // ...既有四阶段逻辑不变（prog / ready / draftRef / gate / review / baseline / stage_complete）...
}
```

> 注：`readMatrix` 需在文件顶部 require（来自 `./devsphere-review-matrix`）。Batch 1 的 inspect 已 require `readMatrix, getRevisionItems`；确认 `readMatrix` 在 require 列表中（若仅 require 了 getRevisionItems，补上 readMatrix）。

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test scripts/test/devsphere-design-batch2.test.js`
Expected: PASS（全部分支）。

- [ ] **Step 5: 跑全套确认无回归**

Run: `node --test 'scripts/test/**/*.test.js'`
Expected: 全绿。

- [ ] **Step 6: 提交**

```bash
git add scripts/devsphere-design.js scripts/test/devsphere-design-batch2.test.js
git commit -m "feat(design): add inspect integrated branch (assemble lifecycle)"
```

---

### Task 4: `record-review` CLI（draft-hash 绑定合并）

**Files:**
- Modify: `scripts/devsphere-design.js`（加 `recordReview` + CLI）
- Test: `scripts/test/devsphere-design-batch2.test.js`（追加）

**Interfaces:**
- Produces: `recordReview(taskPath, stage, snapshots)` —— 读当前 draftRef；调 `applyReviewResults(taskPath, slug, draftRef.version, snapshots)`；再 stamp `entry.draftRef = draftRef`、`entry.status = 'reviewed'`、`entry.reviewedVersion = draftRef.version`；writeMatrix。返回 applyReviewResults 的结果。
- Consumes: `applyReviewResults`、`readMatrix`、`writeMatrix`（来自 `./devsphere-review-matrix`）。

- [ ] **Step 1: 写失败测试**

追加到 `scripts/test/devsphere-design-batch2.test.js`：

```js
const { recordReview, readDraftRef } = require('../devsphere-design');

function writeSolutionDraft(taskPath, id, ver, body = '# solution') {
  const dp = path.join(taskPath, 'work', 'solution-design', 'draft.md');
  fs.mkdirSync(path.dirname(dp), { recursive: true });
  fs.writeFileSync(dp, `---\nartifactId: "${id}"\nversion: "${ver}"\n---\n\n${body}\n`, 'utf-8');
}

test('record-review: 合并多视角 findings 并 stamp draftRef/status', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'solutionDesign');
  writeSolutionDraft(taskPath, 'SD-1', '0.1.0');
  initMatrix(taskPath);
  const draftRef = readDraftRef(taskPath, 'solutionDesign');
  const snapshots = [
    { reviewer: 'sa', artifactId: 'SD-1', artifactVersion: '0.1.0',
      issueFindings: [{ findingId: 'F1', type: 'blocking', reviewerAgent: 'sa', round: 1 }], closureDecisions: [] },
    { reviewer: 'mde', artifactId: 'SD-1', artifactVersion: '0.1.0',
      issueFindings: [{ findingId: 'F1', type: 'advisory', reviewerAgent: 'mde', round: 1 }], closureDecisions: [] },
  ];
  recordReview(taskPath, 'solutionDesign', snapshots);
  const m = readMatrix(taskPath);
  const entry = m.artifacts['solution-design'];
  assert.strictEqual(entry.status, 'reviewed');
  assert.strictEqual(entry.draftRef.hash, draftRef.hash);
  assert.strictEqual(entry.issuesList.length, 2);
});

test('record-review: 同 snapshot 重复合并不翻倍（幂等 source）', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'solutionDesign');
  writeSolutionDraft(taskPath, 'SD-1', '0.1.0');
  initMatrix(taskPath);
  const snapshots = [{ reviewer: 'sa', artifactId: 'SD-1', artifactVersion: '0.1.0',
    issueFindings: [{ findingId: 'F1', type: 'blocking', reviewerAgent: 'sa', round: 1 }], closureDecisions: [] }];
  recordReview(taskPath, 'solutionDesign', snapshots);
  recordReview(taskPath, 'solutionDesign', snapshots); // 重复合并
  const m = readMatrix(taskPath);
  assert.strictEqual(m.artifacts['solution-design'].issuesList.length, 1);
});

test('record-review: 无 draft → 抛错', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'solutionDesign');
  initMatrix(taskPath);
  assert.throws(() => recordReview(taskPath, 'solutionDesign', []), /draft/);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test scripts/test/devsphere-design-batch2.test.js`
Expected: FAIL — `recordReview is not a function`。

- [ ] **Step 3: 实现 recordReview**

`scripts/devsphere-design.js` 顶部 require 区确认有：

```js
const { applyReviewResults, readMatrix, writeMatrix } = require('./devsphere-review-matrix');
```

（若 Batch 1 只 require 了 `readMatrix, getRevisionItems`，扩展为含 `applyReviewResults, writeMatrix`。）

实现：

```js
function recordReview(taskPath, stage, snapshots) {
  const slug = STAGE_SLUG[stage];
  if (!slug) throw new Error(`Unknown stage: ${stage}`);
  const draftRef = readDraftRef(taskPath, stage);
  if (!draftRef) throw new Error(`No valid draft for stage ${stage}`);
  const result = applyReviewResults(taskPath, slug, draftRef.version, snapshots);
  const matrix = readMatrix(taskPath);
  if (!matrix || !matrix.artifacts || !matrix.artifacts[slug]) {
    throw new Error(`Matrix entry missing for ${slug}`);
  }
  matrix.artifacts[slug].draftRef = draftRef;
  matrix.artifacts[slug].status = 'reviewed';
  matrix.artifacts[slug].reviewedVersion = draftRef.version;
  writeMatrix(taskPath, matrix);
  return result;
}
```

把 `recordReview` 加入 `module.exports`。CLI `main()` switch 加：

```js
      case 'record-review': {
        const [taskPath, stage, snapshotsJson] = args;
        let snapshots;
        try { snapshots = JSON.parse(snapshotsJson); } catch (e) { throw new Error(`Invalid snapshots JSON: ${e.message}`); }
        process.stdout.write(JSON.stringify(recordReview(taskPath, stage, snapshots)));
        break;
      }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test scripts/test/devsphere-design-batch2.test.js`
Expected: PASS。

- [ ] **Step 5: 跑全套确认无回归**

Run: `node --test 'scripts/test/**/*.test.js'`
Expected: 全绿。

- [ ] **Step 6: 提交**

```bash
git add scripts/devsphere-design.js scripts/test/devsphere-design-batch2.test.js
git commit -m "feat(design): add record-review CLI (hash-bound multi-perspective merge)"
```

---

### Task 5: 重构四个设计阶段 skill 为 activity 模型

**Files:**
- Modify: `skills/feature-design-business/SKILL.md`、`skills/feature-design-solution/SKILL.md`、`skills/feature-design-implementation/SKILL.md`、`skills/feature-design-test/SKILL.md`
- Possibly: `scripts/test/skill-contracts.test.js`（reconcile 旧断言）
- Test: 全套 `node --test 'scripts/test/**/*.test.js'`（含 skill-contracts）

**Interfaces:**
- Produces: 四个 stage skill 都改为 activity 模型——由主会话按 `inspect` 的 `run_stage.activity ∈ {analyze, discover, design, revise}` 调用；读写 `work/<stage>/{analysis,discovery,design,draft}.md` + `evidence/` + `decisions/`；不写 `artifacts/`/`state.json`/`reviews/`/下游；不自行 AskUserQuestion。
- Consumes: 无脚本依赖（纯文档重构）。

**共享骨架（四个 skill 都按此结构重写）：**

```markdown
---
name: feature-design-<stage>
description: <阶段>设计的专业方法论。主会话按 inspect 的 run_stage.activity 调用 analyze/discover/design/revise，产出到 work/<stage>/。不写 artifacts（由 publish 发布）、不写 state/reviews、不自行询问用户。
---

# Feature Design — <阶段名>设计

<阶段>设计的领域方法论 Skill。主会话按 `inspect` 返回的 `run_stage.activity` 调用本 skill 的对应活动，产出写入 `work/<stage>/`，最终 draft 经 Gate/Review/Baseline 发布为 `artifacts/<stage>.md`。

## 集成契约

- **入口:** 由 `feature-design` skill 在 `run_stage` 动作中加载，按 activity 执行。
- **activity 入参:** `analyze | discover | design | revise`（revise 附 revision items 来源）。
- **读取:** <上游 artifact 列表>、`inputs/requirement.md`、对应 `templates/artifacts/<stage>.md`、`evidence/`、`decisions/<slug>-decisions.json`。
- **允许写入:** `work/<stage>/{analysis,discovery,design,draft}.md`、`evidence/`、`decisions/<slug>-decisions.json`。
- **禁止写入:** `artifacts/`、`state.json`、`reviews/`、`approvals/`、其他阶段 work。
- **用户决策:** 发现需用户判断时写 pending decision（`devsphere-decisions.js add`），不自行 `AskUserQuestion`。主会话在 `ask_decision` 动作统一询问。

## Analyze（产出 analysis.md）
<本阶段 Analyze 关注点。完成后由主会话调 `mark-ready <stage> analysis`。>

## Discover（产出 discovery.md + evidence + decisions）
<本阶段调查项。完成后由主会话调 `mark-ready <stage> discovery`。>

## Design（产出 design.md + draft.md）
<本阶段专业方法。draft.md 完整符合 templates/artifacts/<stage>.md 模板，带 artifactId+version frontmatter。>

## Revise（更新 design.md + draft.md）
<本阶段修订时应重查的内容。改完 draft hash 变，旧 Gate/Review 自动失效，不跳 Gate。>

## 完成标准
<analysis/discovery/draft 各自的可检查完成条件。>

## Context pointers
- artifact 模板: `templates/artifacts/<stage>.md`
- Gate catalog: <对应 governance 文档>
- 上游 artifact: <列表>
```

**各阶段差异表（重写时填入骨架）：**

| Stage | slug | 上游输入 | 保留的专业方法论（从现有 skill 迁入对应 activity 段） |
|---|---|---|---|
| business | business-design | requirement | REQ/BR/NFR 编号、干系人/角色、In/Out Scope、业务流程/状态/规则、验收标准 |
| solution | solution-design | business-design | 架构目标/约束、C4 视图（Context→Container→Component）、4+1 覆盖矩阵、接口契约、数据模型/数据流、NFR |
| implementation | implementation-design | solution-design | 模块/文件布局、调用链、repo 绑定（路径/符号）、实现模式、回滚 |
| test | test-design | business+solution+implementation | 测试策略、场景覆盖、测试数据、准入标准、风险追溯 |

- [ ] **Step 1: 先 grep skill-contracts，看是否有绑定旧形态的断言**

```bash
grep -n "feature-design-business\|feature-design-solution\|feature-design-implementation\|feature-design-test\|--mode\|teammate-conduct\|SA Agent\|SE Agent\|MDE Agent\|TSE Agent" scripts/test/skill-contracts.test.js
```

记录命中行。若有断言依赖 `--mode`、teammate-conduct、Agent 身份或直接写 `artifacts/`，标记为需 reconcile。

- [ ] **Step 2: 重写 business skill**

整体替换 `skills/feature-design-business/SKILL.md`，按共享骨架，stage=business，把现有 skill 的"执行步骤"专业内容（REQ/BR/NFR、干系人、Scope、业务流程/状态/规则、验收标准）迁入 Analyze/Discover/Design 段。删掉 frontmatter 之外的"SA Agent"身份、teammate-conduct、scope/draft/revise 模式描述、直接写 `artifacts/business-design.md` 的语句（改为写 `work/business-design/draft.md`）。

- [ ] **Step 3: 重写 solution skill**

同骨架，stage=solution，迁入 C4/4+1/接口契约/数据模型/NFR 专业内容。

- [ ] **Step 4: 重写 implementation skill**

同骨架，stage=implementation，迁入模块/文件/调用链/repo 绑定/回滚专业内容。

- [ ] **Step 5: 重写 test skill**

同骨架，stage=test，迁入测试策略/场景/数据/准入/风险追溯专业内容。

- [ ] **Step 6: reconcile skill-contracts.test.js**

对 Step 1 命中的断言：把依赖旧形态（`--mode`、teammate-conduct、Agent 身份、直接写 artifacts）的断言改为新形态（activity 驱动、写 `work/<stage>/`、不含 teammate-conduct 引用）。不得削弱契约强度——用等价的 activity-model 断言替换。

- [ ] **Step 7: 跑 skill-contracts + 全套**

Run: `node --test scripts/test/skill-contracts.test.js` → 期望全绿。
Run: `node --test 'scripts/test/**/*.test.js'` → 期望全绿。

- [ ] **Step 8: 提交**

```bash
git add skills/feature-design-business skills/feature-design-solution skills/feature-design-implementation skills/feature-design-test scripts/test/skill-contracts.test.js
git commit -m "refactor(design): rewrite 4 stage skills to activity model"
```

---

### Task 6: 重写 `feature-review` 为 Review Subagent job skill

**Files:**
- Modify: `skills/feature-review/SKILL.md`（整体重写）
- Test: 全套（skill-contracts 若有 feature-review 断言）

**Interfaces:**
- Produces: `feature-review` 作为 Review Subagent 的 job skill——输入 draftPath + draftHash + version + reviewProfile（agents/<role>.md 的"设计评审"段）+ allowedReads；输出 `{findings, closureDecisions, summary}`（findings shape 对齐 `applyReviewResults`：每条 `{findingId, type, reviewerAgent, round}`）；不写 Work/Artifact/matrix、不问用户、发现需用户判断返回 incomplete + unknowns。

- [ ] **Step 1: grep feature-review 现有引用**

```bash
grep -rn "feature-review" skills/ scripts/ | head -20
```

- [ ] **Step 2: 重写 feature-review SKILL.md**

整体替换为：

```markdown
---
name: feature-review
description: 评审 Subagent 的 job skill。接收冻结 Draft + reviewProfile，产出 findings（对齐 review-matrix），不写 Work/Artifact/matrix、不问用户。由主会话在 run_review 动作中按视角并行派发。
---

# Feature Review — 评审 Job

你是**一次性评审 Subagent**。主会话在 `run_review` 动作中并行派发你，你只评审一个冻结 Draft 的一个视角，完成后退出。

## 输入（由派发 prompt 提供）

- `draftPath`、`draftHash`、`version`：冻结 Draft 的位置与指纹。
- `reviewProfile`：你的评审视角 checklist 来源（`agents/<role>.md` 的"设计评审"段，或 integrated 的承接维度 checklist）。
- `allowedReads`：`work/<stage>/{analysis,discovery,design}.md`、`evidence/`、`decisions/`、上游 `artifacts/`。

## 完成标准

- 所有 finding 指向 Draft（引用 draft 章节/行），不评 Work 过程文件本身。
- finding 类型仅 `blocking | advisory | risk_candidate`。
- 每条 finding 带 `findingId`（本视角内唯一，如 `F1`）、`type`、`reviewerAgent`（你的角色名）、`round`。
- 对上一轮的 open issue，若 Draft 已修，给出 `closureDecisions`（`{issueId, status:'closed', closureEvidence}`）。
- 不修改 Draft / Work / Artifact / matrix。
- 不询问用户。发现需用户判断的事项，列入返回的 `unknowns` 并结束。

## 输出

返回 JSON（由主会话收集后调 `record-review`）：

\`\`\`json
{
  "reviewer": "<role>",
  "artifactId": "<从 draft frontmatter>",
  "artifactVersion": "<从 draft frontmatter>",
  "issueFindings": [
    { "findingId": "F1", "type": "blocking", "reviewerAgent": "<role>", "round": 1 }
  ],
  "closureDecisions": [],
  "summary": "一句话评审结论"
}
\`\`\`

## 评审纪律

- 只读 allowedReads；不读下游阶段、不读其他评审的结果。
- blocking 必须是"不修就不能 baseline"的问题；advisory 是建议；risk_candidate 是需用户知晓的风险。
- 不为凑数虚报 finding。
```

- [ ] **Step 3: 跑 skill-contracts + 全套**

Run: `node --test 'scripts/test/**/*.test.js'` → 期望全绿（若 skill-contracts 有 feature-review 旧断言，按新形态 reconcile）。

- [ ] **Step 4: 提交**

```bash
git add skills/feature-review scripts/test/skill-contracts.test.js
git commit -m "refactor(design): rewrite feature-review as Review Subagent job skill"
```

---

### Task 7: 扩展 `feature-design/SKILL.md`（多阶段编排 + 多视角 + integrated）

**Files:**
- Modify: `skills/feature-design/SKILL.md`（Batch 1 已改为生命周期入口；本任务扩展 run_review + 加 current-stage 循环 + integrated 组装 + design_ready + integrated 4 维度 checklist）
- Test: 全套

**Interfaces:**
- Consumes: Task 2 `current-stage`、Task 3 inspect(integrated) `assemble`/`complete`、Task 4 `record-review`、Task 5 stage skills、Task 6 feature-review。
- Produces: 顶层编排 skill 能驱动 business→solution→implementation→test→integrated→design_ready 全流程。

- [ ] **Step 1: 扩展核心循环（加 current-stage 解析）**

在 `feature-design/SKILL.md` 的"核心循环"段，把"对当前阶段初始化 Work"改为按 `current-stage` 解析：

```markdown
## 核心循环

每次循环：
1. 解析当前阶段：
   ```bash
   node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-design.js current-stage <taskPath>
   ```
   - 返回 `{complete:true}` → 设计全部完成，结束。
   - 返回 `{stage:<stage>}` → 对该 stage 调 `init-stage <taskPath> <stage>`（幂等），再：
   ```bash
   node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-design.js inspect <taskPath> <stage>
   ```
2. 按 `nextAction.kind` 执行（见下）。
3. 执行后立即重读（回到步骤 1）。
```

- [ ] **Step 2: 重写 run_review（多视角并行派发 + record-review）**

替换 Batch 1 的单视角 `run_review` 段为：

```markdown
### `run_review`
- 读取当前冻结 Draft 的 `draftRef`（inspect 返回）。
- 查评审视角表得该 artifact 的 N 个视角：
  - business-design → SE
  - solution-design → SA、MDE、TSE
  - implementation-design → SE、DEV、TSE
  - test-design → SA、SE、MDE
  - integrated-design → 4 个承接维度（见下"Integrated 评审"）
- 对设计阶段：**并行派发** N 个 Review Subagent（Agent 原语），每个加载 `feature-review` skill，输入 `draftPath + draftHash + version + reviewProfile=agents/<role>.md + allowedReads`。
- 收齐 N 份 `{reviewer, artifactId, artifactVersion, issueFindings, closureDecisions, summary}`。
- 合并：
  ```bash
  node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-design.js record-review <taskPath> <stage> '<snapshots json>'
  ```
- 重读 inspect：open blocking/apply → revise；通过 → baseline。
- Draft hash 变 → 旧 findings 全失效 → 重新 Gate + 重新派发全部 N 视角。
```

- [ ] **Step 3: 加 run_stage 的 assemble activity + Integrated 评审段**

在 `run_stage` 段补 `activity=assemble`，并新增"Integrated 评审"段：

```markdown
### `run_stage`（activity = analyze | discover | design | revise | assemble）
- analyze/discover/design/revise：加载对应 `feature-design-<stage>` skill 执行（见各 stage skill）。
- activity=assemble（仅 integratedDesign）：主会话组装 `work/integrated-design/draft.md`——汇总四阶段 `artifacts/*.md` + 跨阶段追溯（REQ→ARCH→MOD→TEST）+ 关键 decision + 风险 + readiness。不引入新设计事实。组装完 draft 带 frontmatter（artifactId+version）。

### Integrated 评审（4 个承接维度，不走 agents/*.md）
integrated-design 的 run_review 并行派发 4 个 Review Subagent，每个加载 `feature-review` skill，reviewProfile 为下列维度 checklist（由派发 prompt 注入）：
- **业务承接（reviewer=business-traceability）**：业务要求是否全部被方案承接。
- **实现承接（reviewer=implementation-traceability）**：方案接口/数据/模块是否被实现承接。
- **测试承接（reviewer=test-traceability）**：关键需求/接口/风险是否被测试承接。
- **基线一致（reviewer=baseline-consistency）**：四 artifact 的 version/hash/Gate/Review/Baseline 是否自洽。
收齐后同样调 `record-review <taskPath> integratedDesign '<snapshots>'`。
```

- [ ] **Step 4: 加 baseline 后推进 design_ready**

在 `baseline` 段补：

```markdown
### `baseline`
- 人工批准（按 workflow mode）后：
  ```bash
  node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-design.js publish <taskPath> <stage>
  ```
- publish 原样复制 draft → artifact，校验 hash，写 baseline ref。
- **若 inspect 返回 `complete`（仅 integrated baseline 后）**，推进任务状态：
  ```bash
  node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js set-task-status ${CLAUDE_PROJECT_DIR} design_ready
  ```
  结束（下次 `/workflow` 路由到 feature-approve）。
- 否则重读 inspect。
```

并在"按 nextAction.kind 执行"补 `complete` 分支：

```markdown
### `complete`
- integrated 已 baseline。推进 `design_ready`（见 baseline 段末尾），结束。
```

- [ ] **Step 5: 跑 skill-contracts + 全套**

Run: `node --test 'scripts/test/**/*.test.js'` → 期望全绿。

- [ ] **Step 6: 提交**

```bash
git add skills/feature-design/SKILL.md scripts/test/skill-contracts.test.js
git commit -m "refactor(design): extend feature-design skill (multi-stage + multi-perspective review + integrated + design_ready)"
```

---

### Task 8: 端到端验收（多阶段 + 多视角 + integrated + design_ready）

**Files:**
- Test: `scripts/test/devsphere-design-batch2-e2e.test.js`（新建）

**Interfaces:**
- Consumes: Task 1-4 全部脚本能力。模拟 stage 工作（writeDraft + mark-ready）与 Review Job 结果（直接构造 snapshots 调 record-review），不派真 Subagent（Subagent 派发是 skill 文档行为，由 skill-contracts 保障）。

- [ ] **Step 1: 写端到端测试**

`scripts/test/devsphere-design-batch2-e2e.test.js`：

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { makeTask } = require('./helpers');
const {
  initStage, markReady, inspect, recordGate, publish, recordReview,
  currentStage, draftPath, artifactPath, sha256File, STAGE_SLUG,
} = require('../devsphere-design');
const { initMatrix, readMatrix, writeMatrix, closeIssue } = require('../devsphere-review-matrix');
const { readState } = require('../devsphere-state');

function writeDraft(taskPath, stage, id, ver, body = '# draft') {
  fs.writeFileSync(draftPath(taskPath, stage),
    `---\nartifactId: "${id}"\nversion: "${ver}"\n---\n\n${body}\n`, 'utf-8');
}

function snapshotsFor(reviewer, id, ver, findings) {
  return [{ reviewer, artifactId: id, artifactVersion: ver, issueFindings: findings, closureDecisions: [] }];
}

function gatePassReviewPass(taskPath, stage, id, ver, perReviewer) {
  recordGate(taskPath, stage, 'pass', { templateChecks: [], qualityChecks: [] });
  initMatrix(taskPath);
  const all = [];
  for (const [reviewer, findings] of Object.entries(perReviewer)) {
    all.push({ reviewer, artifactId: id, artifactVersion: ver, issueFindings: findings, closureDecisions: [] });
  }
  recordReview(taskPath, stage, all);
}

function runStageToBaseline(taskPath, stage, id, ver, perReviewer) {
  initStage(taskPath, stage);
  markReady(taskPath, stage, 'analysis');
  markReady(taskPath, stage, 'discovery');
  writeDraft(taskPath, stage, id, ver);
  gatePassReviewPass(taskPath, stage, id, ver, perReviewer);
  assert.deepStrictEqual(inspect(taskPath, stage).nextAction, { kind: 'baseline' });
  publish(taskPath, stage);
}

test('E2E: 四阶段顺序 + 多视角 + integrated + design_ready', () => {
  const { taskPath } = makeTask();

  // business（单视角 SE）
  runStageToBaseline(taskPath, 'businessDesign', 'BD-1', '0.1.0', {
    se: [{ findingId: 'F1', type: 'advisory', reviewerAgent: 'se', round: 1 }],
  });
  assert.strictEqual(currentStage(taskPath).stage, 'solutionDesign');

  // solution（3 视角 SA+MDE+TSE），先 blocking → revise → 重派
  initStage(taskPath, 'solutionDesign');
  markReady(taskPath, 'solutionDesign', 'analysis');
  markReady(taskPath, 'solutionDesign', 'discovery');
  writeDraft(taskPath, 'solutionDesign', 'SD-1', '0.1.0');
  recordGate(taskPath, 'solutionDesign', 'pass', { templateChecks: [], qualityChecks: [] });
  initMatrix(taskPath);
  recordReview(taskPath, 'solutionDesign', [
    { reviewer: 'sa', artifactId: 'SD-1', artifactVersion: '0.1.0', issueFindings: [{ findingId: 'F1', type: 'blocking', reviewerAgent: 'sa', round: 1 }], closureDecisions: [] },
    { reviewer: 'mde', artifactId: 'SD-1', artifactVersion: '0.1.0', issueFindings: [], closureDecisions: [] },
    { reviewer: 'tse', artifactId: 'SD-1', artifactVersion: '0.1.0', issueFindings: [], closureDecisions: [] },
  ]);
  // blocking → revise
  assert.strictEqual(inspect(taskPath, 'solutionDesign').nextAction.kind, 'run_stage');
  assert.strictEqual(inspect(taskPath, 'solutionDesign').nextAction.activity, 'revise');
  // revise draft（hash 变）→ 旧 gate/review 失效
  writeDraft(taskPath, 'solutionDesign', 'SD-1', '0.1.0', '# solution revised');
  assert.deepStrictEqual(inspect(taskPath, 'solutionDesign').nextAction, { kind: 'run_gate' });
  // 重 gate + 重派 3 视角（无 finding）→ baseline
  gatePassReviewPass(taskPath, 'solutionDesign', 'SD-1', '0.1.0', { sa: [], mde: [], tse: [] });
  assert.deepStrictEqual(inspect(taskPath, 'solutionDesign').nextAction, { kind: 'baseline' });
  publish(taskPath, 'solutionDesign');
  assert.strictEqual(currentStage(taskPath).stage, 'implementationDesign');

  // implementation（SE+DEV+TSE）
  runStageToBaseline(taskPath, 'implementationDesign', 'ID-1', '0.1.0', {
    se: [], dev: [], tse: [],
  });
  assert.strictEqual(currentStage(taskPath).stage, 'testDesign');

  // test（SA+SE+MDE）
  runStageToBaseline(taskPath, 'testDesign', 'TD-1', '0.1.0', {
    sa: [], se: [], mde: [],
  });
  assert.strictEqual(currentStage(taskPath).stage, 'integratedDesign');

  // integrated: assemble → gate → 4 维度 review → baseline → complete
  initStage(taskPath, 'integratedDesign');
  assert.deepStrictEqual(inspect(taskPath, 'integratedDesign').nextAction, { kind: 'run_stage', activity: 'assemble' });
  writeDraft(taskPath, 'integratedDesign', 'INT-1', '0.1.0', '# integrated draft');
  gatePassReviewPass(taskPath, 'integratedDesign', 'INT-1', '0.1.0', {
    'business-traceability': [],
    'implementation-traceability': [],
    'test-traceability': [],
    'baseline-consistency': [],
  });
  assert.deepStrictEqual(inspect(taskPath, 'integratedDesign').nextAction, { kind: 'baseline' });
  publish(taskPath, 'integratedDesign');
  assert.deepStrictEqual(inspect(taskPath, 'integratedDesign').nextAction, { kind: 'complete' });
  assert.strictEqual(currentStage(taskPath).complete, true);

  // artifact hash 一致
  for (const stage of ['businessDesign','solutionDesign','implementationDesign','testDesign','integratedDesign']) {
    assert.strictEqual(sha256File(artifactPath(taskPath, stage)), readState(taskPath).stages[stage].baseline.hash);
  }
});
```

- [ ] **Step 2: 跑 E2E**

Run: `node --test scripts/test/devsphere-design-batch2-e2e.test.js`
Expected: PASS。若失败，根据失败点定位：最常见是 `applyReviewResults` 要求 matrix entry 存在（`initMatrix` 已含全部 5 个 artifact，确认调过 initMatrix）、或 `reviewAcceptable` 字段名不一致（按 Batch 1 实现对齐）。

- [ ] **Step 3: 跑全套回归**

Run: `node --test 'scripts/test/**/*.test.js'`
Expected: 全绿（含 Batch 1 全部测试 + 旧 `feature-design-router.test.js`）。

- [ ] **Step 4: 提交**

```bash
git add scripts/test/devsphere-design-batch2-e2e.test.js
git commit -m "test(design): add batch 2 end-to-end (multi-stage + multi-perspective + integrated + design_ready)"
```

---

## Self-Review

**1. Spec 覆盖：**
- B2-2（agents/*.md 作 profile）→ Task 6 feature-review 输入 reviewProfile=agents/<role>.md ✓
- B2-3（并行派 N 个 Review Subagent）→ Task 7 run_review 并行派发 ✓（skill 文档）；Task 8 E2E 用 record-review 验证合并 ✓
- B2-4（Integrated 精简生命周期 + assemble）→ Task 1 init-stage 精简 + Task 3 inspect integrated 分支 + Task 7 assemble ✓
- B2-5（四阶段 skill 重构）→ Task 5 ✓
- B2-6（current-stage 解析器）→ Task 2 ✓
- B2-7（record-review CLI）→ Task 4 ✓
- B2-8（design_ready 推进）→ Task 7 baseline 段 + Task 8 E2E 断言 complete ✓
- B2-9（旧 router 暂留）→ 全程不动 feature-design-router.js；Task 8 Step 3 确认旧 router 测试仍绿 ✓

**2. 占位符扫描：** Task 5 的"各阶段差异表"列出每阶段要迁入的具体方法论项（非占位）；骨架代码完整。Task 6/7 的 skill 内容完整。无 TBD/TODO。

**3. 类型/命名一致性：**
- `currentStage` → `{stage, complete}`，Task 2/7/8 一致 ✓
- `recordReview(taskPath, stage, snapshots)`，snapshot shape 对齐 `applyReviewResults`，Task 4/7/8 一致 ✓
- inspect 对 integrated 返回 `run_stage/assemble` 与 `complete`，对四阶段返回 `stage_complete`，Task 3/7/8 一致 ✓
- `DESIGN_STAGE_ORDER` 含 integrated，Task 2/8 一致 ✓
- integrated 评审维度 reviewer 名（business-traceability 等）Task 7/8 一致 ✓

**实现时留意（非阻塞）：**
- `applyReviewResults` 要求 matrix entry 存在；`initMatrix`（BASE_REVIEWERS 含全部 5 artifact）已覆盖，Task 8 测试需在 record-review 前调 initMatrix。
- `inspect` 顶部需 require `readMatrix`（Batch 1 已 require `readMatrix, getRevisionItems`，确认 Task 3/4 不重复 require）。
- Task 5 reconcile skill-contracts 时不得削弱契约强度——用等价 activity-model 断言替换旧断言。
- Subagent 并行派发是 skill 文档行为（Task 7），不由测试直接驱动；Task 8 用 record-review 模拟 Subagent 返回的 findings，验证合并与流程。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-18-feature-design-refactor-batch2.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
