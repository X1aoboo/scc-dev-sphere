# 人工设计变更 Design Manual Change Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增用户可调用的 `design-manual-change` Skill——人工直接修改 draft、跳过隔离 AI Reviewer、保留确定性 lint，补记人工检视评审与审批后发布新基线，全程一致性校验（哈希链）通过。

**Architecture:** 两个 CLI 扩展承载确定性逻辑：`design reopen --mode <standard|protect>`（protect 保护已改 draft 不被回迁覆盖）与 `design record-manual-review`（写入与现有 schema 完全兼容的人工检视 review 状态，`reviewer: 'human'` + `manual: true`）。`approveCurrentDesign`/`publish`/`designReady`/`validateDesignEntry` **零改动**——review 记录的 `draftHash`/`semanticHash`/`reviewKey`/`policyHash`/`reportHash` 五重绑定使现有校验天然通过。Skill 只做编排，受内容保真约束。

**Tech Stack:** Node.js 内置模块、`node:test`、无第三方依赖。

**Spec:** `docs/superpowers/specs/2026-09-20-design-manual-change-design.md`

## Global Constraints

- 测试命令：`node --test scripts/test/design-manual-change-contract.test.js`（无 package.json，直接 node:test）。
- `approveCurrentDesign`、`publish`、`designReady`、`validatePersistedReview`、`validateDesignEntry` 的现有实现**不得修改**——本计划只新增动作与 reopen 的模式参数。
- review 记录必须满足现有校验链：`schemaVersion: 3`、`status: 'pass'`、`findingSummary` 全零且 `total = blocking+advisory+risk`、`checklists` 覆盖 Policy 全部 `required` 项、conditional 项要么在 `checklists` 要么在 `notApplicable`（本设计取全部进 `checklists`、`notApplicable: []`）、`reviewKey: '<designType>:<semanticHash>'`、`reportHash = sha256(review.md)` 且 review.md 与 review.json 同写。
- `record-manual-review` 的全部前置校验（draft 存在、lint 通过且绑定、无既有 review 状态、reason 非空）先于任何写入——失败无副作用。
- reopen `protect` 模式：**不得**修改 draft 正文内容（仅 frontmatter version major+1）、**不得**触碰 draft 资产目录。
- Skill（`skills/design-manual-change/SKILL.md`）须 `disable-model-invocation: true`、中文正文、含内容保真规则与批准前确认规则。
- 基线：仓库有 1 个预存无关测试失败（`feature-design-skill-contract` 的 "delegates lossless Draft writing"，master 基线即有）。全量门槛 = 无**新增**失败（当前基线 178 测试 / 177 通过 / 1 失败）。

---

### Task 1: `design reopen --mode <standard|protect>`

**Files:**
- Modify: `scripts/devsphere-design.js`（`reopenDesign` 增加第三参数 `options`）
- Modify: `scripts/devsphere-cli.js`（`dispatchDesign` 的 reopen 分支与允许选项）
- Test: `scripts/test/design-manual-change-contract.test.js`（新建）

**Interfaces:**
- Consumes: 现有 `readArtifactRef`、`bumpMajorVersion`、`initDesign`、`copyAssetFiles`、`unlinkIfExists`、`removeDirectoryIfExists`、路径函数（均在 `devsphere-design.js` 内）。
- Produces: `reopenDesign(taskPath, designType, options = {})`——`options.mode` 取 `'standard'`（默认，行为与现状逐字节一致）或 `'protect'`；返回值在现有字段上增加 `mode`。非法 mode 抛 `Invalid reopen mode: <mode>`。Task 2/3 复用。

- [ ] **Step 1: 新建测试文件并写失败测试**

新建 `scripts/test/design-manual-change-contract.test.js`：

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeTask } = require('./helpers');
const { businessDraft, installBusinessAssets } = require('./fixtures/business-design');
const {
  initDesign,
  draftPath,
  draftAssetsPath,
  artifactPath,
  artifactAssetsPath,
  lintDraft,
  reviewContext,
  recordReview,
  approveCurrentDesign,
  publish,
  reopenDesign,
  readDraftRef,
  readArtifactRef,
  inspectDesign,
} = require('../devsphere-design');
const { HELP, main } = require('../devsphere-cli');
const { validateDesignEntry } = require('../workflows/feature-workflow');

const root = path.join(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

function capture(argv) {
  let stdout = '';
  let stderr = '';
  const exitCode = main(argv, {
    cwd: root,
    env: {},
    stdin: undefined,
    stdout: { write: value => { stdout += value; } },
    stderr: { write: value => { stderr += value; } },
  });
  return { exitCode, stdout, stderr };
}

const TASK_ID = 'FEAT-MANUAL-001';

// Mirrors the publish chain from feature-design-realistic-dry-run.test.js:
// draft -> lint pass -> AI review pass -> human approval -> published baseline.
function publishBaseline(taskPath, designType = 'businessDesign') {
  initDesign(taskPath, designType);
  fs.writeFileSync(draftPath(taskPath, designType), businessDraft(TASK_ID), 'utf8');
  installBusinessAssets(taskPath);
  assert.strictEqual(lintDraft(taskPath, designType).status, 'pass');
  const context = reviewContext(taskPath, designType);
  recordReview(taskPath, designType, {
    reviewKey: context.reviewKey,
    draftHash: context.draft.draftHash,
    policyHash: context.policyHash,
    baseReportHash: context.report.hash,
    reportAppend: '# Design Review Baseline\n',
    checklists: [...context.requiredChecklists, ...context.conditionalChecklists].map(({ checklistId }) => ({
      checklistId, result: 'pass', summary: '通过', findings: [],
    })),
    notApplicable: [],
  });
  approveCurrentDesign(taskPath, designType, { approvedBy: 'human', acceptedRisks: [] });
  publish(taskPath, designType);
}

function prepareDesigningTask() {
  const created = makeTask({ taskId: TASK_ID });
  const statePath = path.join(created.taskPath, 'state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  state.status = 'designing';
  state.requiredDesignTypes = ['businessDesign', 'solutionDesign', 'implementationDesign', 'testDesign'];
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
  fs.writeFileSync(path.join(created.taskPath, 'inputs', 'proposal.md'), '# Proposal\n\nDetailed requirement.', 'utf8');
  fs.writeFileSync(path.join(created.taskPath, 'inputs', 'requirement-clarification.md'), '# Clarification\n\nApproved clarification.', 'utf8');
  return created;
}

test('reopen protect preserves the hand-edited draft and bumps only the version', () => {
  const { taskPath } = prepareDesigningTask();
  publishBaseline(taskPath);

  // Simulate the user hand-editing the draft after publish.
  const edited = businessDraft(TASK_ID).replace('# 业务设计', '# 业务设计\n\n人工修改：新增审批链路降级策略。');
  fs.writeFileSync(draftPath(taskPath, 'businessDesign'), edited, 'utf8');
  fs.writeFileSync(path.join(draftAssetsPath(taskPath, 'businessDesign'), 'ucd', 'manual-note.svg'), '<svg>edited</svg>', 'utf8');

  const result = reopenDesign(taskPath, 'businessDesign', { mode: 'protect' });
  assert.strictEqual(result.mode, 'protect');

  const draft = fs.readFileSync(draftPath(taskPath, 'businessDesign'), 'utf8');
  assert.match(draft, /人工修改：新增审批链路降级策略。/);
  assert.match(draft, /^version: "2\.0\.0"$/m);
  assert.doesNotMatch(draft, /"1\.0\.0"/);

  // Draft assets untouched by protect mode.
  assert.strictEqual(
    fs.readFileSync(path.join(draftAssetsPath(taskPath, 'businessDesign'), 'ucd', 'manual-note.svg'), 'utf8'),
    '<svg>edited</svg>',
  );

  // History snapshot holds the pre-change baseline (version 1.0.0).
  const history = fs.readFileSync(path.join(
    taskPath, 'artifacts', 'history', 'business-design', '1.0.0', 'design.md',
  ), 'utf8');
  assert.match(history, /^version: "1\.0\.0"$/m);
  assert.doesNotMatch(history, /人工修改/);

  // Baseline, approval, review, lint state are all cleared.
  assert.strictEqual(fs.existsSync(artifactPath(taskPath, 'businessDesign')), false);
  assert.strictEqual(fs.existsSync(artifactAssetsPath(taskPath, 'businessDesign')), false);
  assert.strictEqual(inspectDesign(taskPath, 'businessDesign').recovery, 'resume_from_draft');
});

test('reopen standard stays byte-identical to legacy behavior', () => {
  const { taskPath } = prepareDesigningTask();
  publishBaseline(taskPath);
  fs.writeFileSync(draftPath(taskPath, 'businessDesign'), '# user edits that must be discarded', 'utf8');
  const result = reopenDesign(taskPath, 'businessDesign');
  assert.strictEqual(result.mode, 'standard');
  const draft = fs.readFileSync(draftPath(taskPath, 'businessDesign'), 'utf8');
  assert.match(draft, /^version: "2\.0\.0"$/m);
  assert.doesNotMatch(draft, /user edits that must be discarded/);
});

test('reopen protect rejects when no draft exists', () => {
  const { taskPath } = prepareDesigningTask();
  publishBaseline(taskPath);
  fs.rmSync(draftPath(taskPath, 'businessDesign'));
  assert.throws(
    () => reopenDesign(taskPath, 'businessDesign', { mode: 'protect' }),
    /protect mode requires an existing Draft/,
  );
  assert.ok(fs.existsSync(artifactPath(taskPath, 'businessDesign')), 'baseline untouched');
});

test('reopen protect rejects when the draft version frontmatter is broken', () => {
  const { taskPath } = prepareDesigningTask();
  publishBaseline(taskPath);
  const broken = businessDraft(TASK_ID).replace(/^version: "1\.0\.0"$/m, 'version: "abc"');
  fs.writeFileSync(draftPath(taskPath, 'businessDesign'), broken, 'utf8');
  assert.throws(
    () => reopenDesign(taskPath, 'businessDesign', { mode: 'protect' }),
    /no semantic version/i,
  );
  assert.ok(fs.existsSync(artifactPath(taskPath, 'businessDesign')), 'baseline untouched');
});

test('reopen rejects invalid mode without side effects', () => {
  const { taskPath } = prepareDesigningTask();
  publishBaseline(taskPath);
  assert.throws(() => reopenDesign(taskPath, 'businessDesign', { mode: 'bogus' }), /Invalid reopen mode/);
  assert.ok(fs.existsSync(artifactPath(taskPath, 'businessDesign')));
  assert.throws(() => reopenDesign(taskPath, 'businessDesign', { mode: '../escape' }), /Invalid reopen mode/);
});

test('reopen CLI accepts --mode and rejects unknown values', () => {
  const { taskPath } = prepareDesigningTask();
  publishBaseline(taskPath);
  const out = capture([
    'design', 'reopen', '--task-path', taskPath,
    '--design-type', 'businessDesign', '--mode', 'bogus',
  ]);
  assert.strictEqual(out.exitCode, 1);
  assert.match(out.stderr, /Invalid reopen mode/);
  assert.ok(fs.existsSync(artifactPath(taskPath, 'businessDesign')));
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test scripts/test/design-manual-change-contract.test.js`
Expected: FAIL——`reopenDesign` 第三参数被忽略（`result.mode` undefined）、protect 下 draft 被基线覆盖、CLI `--mode` 报 `Unknown option`。（`reopen standard` 用例可能已 PASS——它是现状回归。）

- [ ] **Step 3: 实现**

`scripts/devsphere-design.js` 将现有 `reopenDesign`（约 1540 行起）整体替换为：

```js
function reopenDesign(taskPath, designType, options = {}) {
  const mode = options.mode || 'standard';
  if (!['standard', 'protect'].includes(mode)) {
    throw new Error(`Invalid reopen mode: ${mode}`);
  }
  const definition = definitionFor(designType);
  const artifact = artifactPath(taskPath, designType);
  const artifactAssets = artifactAssetsPath(taskPath, designType);
  const ref = readArtifactRef(taskPath, designType);
  if (!ref) throw new Error(`No valid Baseline to reopen: ${designType}`);
  const historyDir = path.join(taskPath, 'artifacts', 'history', definition.slug, ref.version);
  const history = path.join(historyDir, 'design.md');
  const historyAssets = path.join(historyDir, `${definition.slug}-assets`);
  fs.mkdirSync(historyDir, { recursive: true });
  fs.copyFileSync(artifact, history);
  copyAssetFiles(artifactAssets, historyAssets);
  initDesign(taskPath, designType);
  const draftFile = draftPath(taskPath, designType);
  if (mode === 'protect') {
    // Protect an already hand-edited Draft: bump its version in place, never
    // overwrite its content and never touch its assets directory.
    if (!fs.existsSync(draftFile)) {
      throw new Error('protect mode requires an existing Draft (use standard mode)');
    }
    fs.writeFileSync(draftFile, bumpMajorVersion(fs.readFileSync(draftFile, 'utf8')), 'utf8');
  } else {
    removeDirectoryIfExists(draftAssetsPath(taskPath, designType));
    copyAssetFiles(artifactAssets, draftAssetsPath(taskPath, designType));
    fs.writeFileSync(draftFile, bumpMajorVersion(fs.readFileSync(artifact, 'utf8')), 'utf8');
  }
  unlinkIfExists(artifact);
  removeDirectoryIfExists(artifactAssets);
  unlinkIfExists(reviewSummaryPath(taskPath, designType));
  unlinkIfExists(reviewReportPath(taskPath, designType));
  unlinkIfExists(lintStatusPath(taskPath, designType));
  unlinkIfExists(approvalPath(taskPath, designType));
  return {
    designType,
    mode,
    historyFile: history,
    historyAssets: ref.assets.length > 0 ? historyAssets : undefined,
    draft: draftFile,
    draftAssets: ref.assets.length > 0 ? draftAssetsPath(taskPath, designType) : undefined,
  };
}
```

注意与现状的差异：`initDesign` 提到两个分支之前（protect 模式下也保证 notes 存在）；standard 分支的行为顺序与原实现一致（先删 draft 资产再拷贝、draft ← bump(artifact)）。`module.exports` 中 `reopenDesign` 已导出，无需改。

`scripts/devsphere-cli.js` 的 `dispatchDesign` 两处修改：

(a) 允许选项列表扩展（`record-review`/`approve-current-design` 那行之后）：

```js
  requireAllowedOptions(options, [
    ...taskAndType,
    ...(['record-review', 'approve-current-design'].includes(action) ? ['input-file'] : []),
    ...(action === 'reopen' ? ['mode'] : []),
  ]);
```

(b) switch 内 reopen 分支改为：

```js
    case 'reopen': return design.reopenDesign(taskPath, designType, { mode: options.mode });
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test scripts/test/design-manual-change-contract.test.js`
Expected: 全部 PASS（standard 回归用例证明无行为漂移）。

再跑 `node --test scripts/test/*.test.js`——期望与基线一致：仅 1 个预存失败（`feature-design-skill-contract` 的 "delegates lossless Draft writing"），无新增失败。

- [ ] **Step 5: 提交**

```bash
git add scripts/devsphere-design.js scripts/devsphere-cli.js scripts/test/design-manual-change-contract.test.js
git commit -m "feat(design): add protect mode to design reopen for hand-edited drafts"
```

---

### Task 2: `design record-manual-review`（CLI + 全链路 e2e）

**Files:**
- Modify: `scripts/devsphere-design.js`（新增 `recordManualReview`，置于 `recordReview` 之后）
- Modify: `scripts/devsphere-cli.js`（`dispatchDesign` 新增分支、HELP design 行）
- Test: `scripts/test/design-manual-change-contract.test.js`（追加）

**Interfaces:**
- Consumes: Task 1 的 `reopenDesign(..., { mode })`；现有 `readDraftRef`、`currentLintStatus`、`loadReviewPolicy`、`reviewSummaryPath`、`reviewReportPath`、`sha256File`、`writeJSON`、`definitionFor`。
- Produces: `recordManualReview(taskPath, designType, input)`——`input: { reason: string }`（必填非空）；返回写入的 summary（含 `reviewer: 'human'`、`manual: true`、`reason`）。CLI：`design record-manual-review --task-path <p> --design-type <t> --input-file <f|->`。Task 3 的 Skill 编排此命令。

- [ ] **Step 1: 写失败测试**

追加到 `scripts/test/design-manual-change-contract.test.js`（顶部 require 从 `../devsphere-design` 增补导入 `recordManualReview`, `validateReview`, `designReady`, `syncDesignState`）：

```js
// Sets up a published baseline, reopens it in protect mode, then applies the
// caller's edit. Does NOT run lint — each test decides whether lint has run,
// because recordManualReview's precondition order is draft → lint → existing
// review → reason.
function manualChangeScenario(applyEdit = () => {}) {
  const created = prepareDesigningTask();
  publishBaseline(created.taskPath);
  reopenDesign(created.taskPath, 'businessDesign', { mode: 'protect' });
  applyEdit(created.taskPath);
  return created;
}

function passLint(taskPath) {
  assert.strictEqual(lintDraft(taskPath, 'businessDesign').status, 'pass');
}

test('record-manual-review writes a review state that passes the whole existing chain', () => {
  const { taskPath } = manualChangeScenario(taskPath => {
    // Minimal inline human edit: append a plain paragraph inside the last
    // existing section (no new heading — keeps lint structure intact).
    const draft = fs.readFileSync(draftPath(taskPath, 'businessDesign'), 'utf8');
    fs.writeFileSync(draftPath(taskPath, 'businessDesign'), `${draft}\n人工补充：审批服务不可用时降级为逐级人工审批。\n`, 'utf8');
  });
  passLint(taskPath);

  const summary = recordManualReview(taskPath, 'businessDesign', { reason: '补充审批降级策略' });
  assert.strictEqual(summary.schemaVersion, 3);
  assert.strictEqual(summary.status, 'pass');
  assert.strictEqual(summary.reviewer, 'human');
  assert.strictEqual(summary.manual, true);
  assert.strictEqual(summary.reason, '补充审批降级策略');
  assert.deepStrictEqual(summary.findingSummary, { blocking: 0, advisory: 0, risk: 0, total: 0 });
  assert.ok(fs.existsSync(path.join(taskPath, 'work', 'business-design', 'review.md')));

  // Existing gates pass unchanged.
  assert.strictEqual(validateReview(taskPath, 'businessDesign').valid, true);
  approveCurrentDesign(taskPath, 'businessDesign', {
    approvedBy: 'human',
    summary: 'manual-design-change: 补充审批降级策略',
    acceptedRisks: [],
  });
  publish(taskPath, 'businessDesign');
  syncDesignState(taskPath);

  // New baseline is version 2.0.0 and approval binds it.
  const artifact = readArtifactRef(taskPath, 'businessDesign');
  assert.strictEqual(artifact.version, '2.0.0');
  assert.strictEqual(designReady(taskPath).valid, false); // other required designs still missing
  assert.strictEqual(
    designReady(taskPath).issues.some(issue => issue.includes('businessDesign')),
    false,
    'businessDesign itself must not be the failing issue',
  );

  // Downstream entry gate passes for the manually changed upstream.
  assert.strictEqual(validateDesignEntry(taskPath, 'solutionDesign').valid, true);
});

test('record-manual-review rejects missing reason with no writes', () => {
  const { taskPath } = manualChangeScenario();
  passLint(taskPath); // reason is checked after lint in the precondition order
  assert.throws(() => recordManualReview(taskPath, 'businessDesign', {}), /non-empty reason/);
  assert.throws(() => recordManualReview(taskPath, 'businessDesign', { reason: '   ' }), /non-empty reason/);
  assert.strictEqual(fs.existsSync(path.join(taskPath, 'work', 'business-design', 'review.json')), false);
  assert.strictEqual(fs.existsSync(path.join(taskPath, 'work', 'business-design', 'review.md')), false);
});

test('record-manual-review rejects when lint has not run for the current draft', () => {
  const { taskPath } = manualChangeScenario(taskPath => {
    // Edit WITHOUT running lint: no lint state binds the new draft.
    const draft = fs.readFileSync(draftPath(taskPath, 'businessDesign'), 'utf8');
    fs.writeFileSync(draftPath(taskPath, 'businessDesign'), `${draft}\n人工补充：未经 lint 的新内容。\n`, 'utf8');
  });
  assert.throws(() => recordManualReview(taskPath, 'businessDesign', { reason: 'x' }), /lint_not_ready/);
  assert.strictEqual(fs.existsSync(path.join(taskPath, 'work', 'business-design', 'review.json')), false);
});

test('record-manual-review rejects when a review state already exists', () => {
  const { taskPath } = manualChangeScenario();
  passLint(taskPath);
  recordManualReview(taskPath, 'businessDesign', { reason: 'first' });
  assert.throws(
    () => recordManualReview(taskPath, 'businessDesign', { reason: 'second' }),
    /Review state already exists; reopen the design first/,
  );
});

test('record-manual-review CLI works end to end', () => {
  const { taskPath } = manualChangeScenario();
  passLint(taskPath);
  const input = path.join(taskPath, 'manual-input.json');
  fs.writeFileSync(input, JSON.stringify({ reason: 'CLI 变更原因' }), 'utf8');
  const out = capture([
    'design', 'record-manual-review', '--task-path', taskPath,
    '--design-type', 'businessDesign', '--input-file', input,
  ]);
  assert.strictEqual(out.exitCode, 0, out.stderr);
  const summary = JSON.parse(out.stdout);
  assert.strictEqual(summary.manual, true);
  assert.strictEqual(validateReview(taskPath, 'businessDesign').valid, true);
});

test('HELP exposes record-manual-review', () => {
  assert.match(HELP, /record-manual-review/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test scripts/test/design-manual-change-contract.test.js`
Expected: 新用例 FAIL（`recordManualReview is not a function` / CLI `Unknown design action`）。

- [ ] **Step 3: 实现**

`scripts/devsphere-design.js` 在 `recordReview` 函数之后新增：

```js
// Records a human-verified manual design change in place of the isolated AI
// Reviewer. The written state deliberately mirrors recordReview's schema so
// validatePersistedReview, approveCurrentDesign, publish and designReady pass
// without modification; `reviewer: 'human'` + `manual: true` keep the audit
// trail distinguishable from AI reviews.
function recordManualReview(taskPath, designType, input) {
  definitionFor(designType);
  const draft = readDraftRef(taskPath, designType);
  if (!draft) throw new Error(`No valid Draft for ${designType}`);
  if (!currentLintStatus(taskPath, designType, draft)) {
    throw new Error('lint_not_ready: current Draft must have a matching passing lint state before review');
  }
  if (!input || typeof input.reason !== 'string' || !input.reason.trim()) {
    throw new Error('Manual review requires a non-empty reason');
  }
  const summaryFile = reviewSummaryPath(taskPath, designType);
  const reportFile = reviewReportPath(taskPath, designType);
  if (fs.existsSync(summaryFile) || fs.existsSync(reportFile)) {
    throw new Error('Review state already exists; reopen the design first');
  }
  const loaded = loadReviewPolicy(designType);
  const policy = loaded.policy.designTypes[designType];
  const reviewKey = `${designType}:${draft.semanticHash}`;
  const report = [
    '# 人工设计变更检视记录',
    '',
    `- 设计类型: ${designType}`,
    `- 变更原因: ${input.reason.trim()}`,
    '- 声明: 人工已检视完成，豁免隔离 AI Reviewer',
    `- 检视时间: ${new Date().toISOString()}`,
    `- Draft 哈希: ${draft.hash}`,
    '',
  ].join('\n');
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, report, { encoding: 'utf8', flag: 'wx' });
  const summary = {
    schemaVersion: 3,
    designType,
    reviewKey,
    draftHash: draft.hash,
    semanticHash: draft.semanticHash,
    policyHash: loaded.hash,
    status: 'pass',
    checklists: [...policy.required, ...policy.conditional].map(item => ({
      checklistId: item.checklistId,
      result: 'pass',
      summary: '人工检视',
    })),
    notApplicable: [],
    findingSummary: { blocking: 0, advisory: 0, risk: 0, total: 0 },
    reviewer: 'human',
    manual: true,
    reason: input.reason.trim(),
    reviewedAt: new Date().toISOString(),
  };
  summary.reportHash = sha256File(reportFile);
  writeJSON(summaryFile, summary);
  return summary;
}
```

`module.exports` 增加导出 `recordManualReview`（与 `recordReview` 相邻）。

`scripts/devsphere-cli.js`：

(a) `dispatchDesign` 允许选项行的 input-file 集合加入 `'record-manual-review'`：

```js
    ...(['record-review', 'approve-current-design', 'record-manual-review'].includes(action) ? ['input-file'] : []),
```

(b) switch 新增分支（`record-review` 之后）：

```js
    case 'record-manual-review': return design.recordManualReview(taskPath, designType, readStructuredInput(options, io));
```

(c) HELP 的 design 行加入 `record-manual-review`（放在 `record-review` 旁，如 `record-review | record-manual-review | refresh-format-review`，保持该行单行、动作以 ` | ` 分隔的风格）。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test scripts/test/design-manual-change-contract.test.js`
Expected: 全部 PASS（含全链路 e2e：record → validateReview → approve → publish → designReady → validateDesignEntry）。

再跑 `node --test scripts/test/*.test.js`——仅 1 个预存失败，无新增。

- [ ] **Step 5: 提交**

```bash
git add scripts/devsphere-design.js scripts/devsphere-cli.js scripts/test/design-manual-change-contract.test.js
git commit -m "feat(design): add record-manual-review for human-verified manual design changes"
```

---

### Task 3: `design-manual-change` Skill + README + 契约测试

**Files:**
- Create: `skills/design-manual-change/SKILL.md`
- Modify: `README.md`（技能表设计通用能力行）
- Test: `scripts/test/design-manual-change-contract.test.js`（追加）

**Interfaces:**
- Consumes: Task 1-2 的 CLI（`design inspect-design`、`design reopen --mode`、`workflow sync-design-status`、`design lint`、`design validate-draft`、`design record-manual-review`、`design approve-current-design`、`design publish`、`state get-task-path`）。
- Produces: 用户可调用 Skill `/scc-dev-sphere:design-manual-change`。

- [ ] **Step 1: 写失败测试**

追加到测试文件：

```js
test('design-manual-change skill is user-invocable only and forbids model invocation', () => {
  const skill = read('skills/design-manual-change/SKILL.md');
  assert.match(skill, /^name: design-manual-change$/m);
  assert.match(skill, /人工设计变更|人工设计修改/);
  assert.match(skill, /^disable-model-invocation: true$/m);
  assert.doesNotMatch(skill, /^user-invocable:\s*false$/m);
  assert.doesNotMatch(skill, /^context:\s*fork$/m);
});

test('design-manual-change skill orchestrates the manual change via devsphere CLI', () => {
  const skill = read('skills/design-manual-change/SKILL.md');
  const process = skill.match(/## 执行步骤([\s\S]*?)## 规则/)[1];
  assert.strictEqual((process.match(/^\d+\. /gm) || []).length, 10);
  for (const phrase of [
    /state get-task-path/,
    /inspect-design/,
    /design reopen --mode standard/,
    /design reopen --mode protect/,
    /sync-design-status/,
    /design lint/,
    /validate-draft/,
    /record-manual-review/,
    /approve-current-design/,
    /design publish/,
  ]) assert.match(skill, phrase);
  assert.match(skill, /## 集成契约/);
  assert.match(skill, /## 完成/);
});

test('design-manual-change skill carries fidelity and approval rules', () => {
  const skill = read('skills/design-manual-change/SKILL.md');
  const rules = skill.match(/## 规则([\s\S]*?)## 完成/)[1];
  assert.match(rules, /仅用户显式调用/);
  assert.match(rules, /内容保真/);
  assert.match(rules, /不得主动修改/);
  assert.match(rules, /禁止裁剪|不得裁剪/);
  assert.match(rules, /批准前.*确认|明确确认/);
  assert.match(rules, /确定性执行/);
});

test('README lists design-manual-change in the skills table', () => {
  const readme = read('README.md');
  assert.match(readme, /design-manual-change/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test scripts/test/design-manual-change-contract.test.js`
Expected: 新用例 FAIL（SKILL.md 不存在 / README 无链接）。

- [ ] **Step 3: 创建 SKILL.md 并更新 README**

`skills/design-manual-change/SKILL.md`：

````markdown
---
name: design-manual-change
description: 人工设计变更：用户直接修改 draft 并人工检视，跳过隔离 AI Reviewer，保留确定性 lint；skill 补记人工检视评审与人工审批后发布新基线，保证一致性校验通过。禁止模型自动调用，仅用户在主会话显式调用。
disable-model-invocation: true
---

# Design Manual Change — 人工设计变更

对**已发布基线**的设计做人工变更：用户直接修改 draft 并自行检视，跳过隔离 AI Reviewer，保留确定性 lint；本 skill 负责编排 reopen、补记人工检视评审、人工批准与发布，使新基线的整条一致性校验（lint → review → approval → publish → 下游入场）全部通过。

## 集成契约

- **入口:** `/scc-dev-sphere:design-manual-change`
- **入参:** 设计类型（存在已发布基线者单选）、变更原因（必填）、人工批准确认（必选）
- **输出:** 新版本基线（major+1）+ `artifacts/history/` 历史快照 + `reviewer: 'human'` 审计记录
- **完成标准:** 新基线已发布、状态已同步、审计记录可区分人工变更

## 执行步骤

1. 定位目标：执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" state get-task-path --workspace-root "<workspaceRoot>"` 取当前任务；对四种设计类型逐一执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" design inspect-design --task-path "<taskPath>" --design-type <designType>`，过滤出 `artifact` 存在的结果（`recovery` 为 `baseline_complete` 或 `needs_user_confirmation`），以单选列表呈现给用户。无可选时提示"无已发布基线的设计"并终止。
2. 分流 reopen：`recovery === 'baseline_complete'` → 执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" design reopen --task-path "<taskPath>" --design-type <designType> --mode standard` 后**暂停**，提示用户直接编辑 `work/<slug>/draft.md` 及配套资产，等待用户明确确认修改完成；`recovery === 'needs_user_confirmation'` → 识别为已有人工修改，执行 `... --mode protect` 保护已改内容。
3. reopen 后执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" workflow sync-design-status --workspace-root "<workspaceRoot>"` 使任务状态回落。
4. 收集变更原因：以自然语言向用户提问，必填非空。
5. 执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" design lint --task-path "<taskPath>" --design-type <designType>`；失败时按下述"内容保真"规则辅助修复，向用户展示修复 diff 并获确认后重跑，直至通过；无法保真修复时向用户说明冲突点并交回。
6. 执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" design validate-draft --task-path "<taskPath>" --design-type <designType>` 确认 lint 状态绑定当前 draft。
7. 将变更原因写入临时 JSON 文件（`{"reason": "<原因>"}`），执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" design record-manual-review --task-path "<taskPath>" --design-type <designType> --input-file <file>`。
8. 人工批准：向用户呈现变更摘要（原因、版本、lint 结果），获用户**明确确认**后执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" design approve-current-design --task-path "<taskPath>" --design-type <designType> --input-file <file>`，输入 `{"approvedBy": "human", "summary": "manual-design-change: <原因>", "acceptedRisks": []}`；用户不确认则终止，不写批准记录。
9. 执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" design publish --task-path "<taskPath>" --design-type <designType>`，随后 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" workflow sync-design-status --workspace-root "<workspaceRoot>"`。
10. 展示摘要：新基线版本与路径、历史快照位置、`reviewer: 'human'` 审计标记、下游设计入场校验已恢复。

## 规则

- **仅用户显式调用**：不得被模型自动触发；只在用户在主会话输入 `/scc-dev-sphere:design-manual-change` 时执行。
- **内容保真**：不得主动修改 `draft.md` 及配套资产内容；唯二例外是 CLI 的版本号 +1（发生在用户修改之前）与 lint 辅助修复。lint 辅助修复仅限机械性修正（frontmatter 字段、固定结构标题、格式、以用户已写内容为基础的占位符最小补全）；禁止裁剪、删除、概括或改写用户的设计变更内容；无法在不失真的前提下修复时交回用户；修复 diff 必须经用户确认。
- **批准前确认**：批准记录写入前必须向用户呈现变更摘要并获明确确认；用户不确认即终止。
- **确定性执行**：reopen、评审补记、批准、发布、状态同步全部委托 `devsphere` CLI；Skill 不自行拼接路径或写状态文件。
- **非法输入拦截**：无已发布基线、lint 未通过、已有评审状态等错误由脚本拦截，Skill 透传并终止。

## 完成

新基线已发布且任务状态已同步，向用户呈现新基线版本、历史快照位置与人工变更审计标记后完成。
````

`README.md` 技能表"设计通用能力"行（当前含 `design-draft`、`design-reopen`、`design-archive`、`design-active`）追加 `、[`design-manual-change`](skills/design-manual-change/SKILL.md)`。执行前先 `grep -n "design-active" README.md` 核对该行现状。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test scripts/test/design-manual-change-contract.test.js`
Expected: 全部 PASS。

全量：`node --test scripts/test/*.test.js`——仅 1 个预存失败，无新增。

- [ ] **Step 5: 提交**

```bash
git add skills/design-manual-change/SKILL.md README.md scripts/test/design-manual-change-contract.test.js
git commit -m "feat(skill): add design-manual-change for human-verified design changes"
```

---

### Task 4: 全链路手工冒烟与收尾验证

**Files:**
- 无代码变更；验证-only。

**Interfaces:**
- Consumes: Task 1-3 的全部交付。
- Produces: 冒烟证据（写进最终报告，不提交文件）。

- [ ] **Step 1: 临时 workspace 冒烟**

```bash
TMP=$(mktemp -d)
node scripts/devsphere-cli.js workspace create-feature-task --workspace-root "$TMP" --task-id FEAT-SMOKE
TASK="$TMP/.devsphere/tasks/feature/FEAT-SMOKE"
node -e '
const fs = require("fs");
const p = process.argv[1] + "/state.json";
const s = JSON.parse(fs.readFileSync(p, "utf8"));
s.status = "designing";
s.requiredDesignTypes = ["businessDesign", "solutionDesign", "implementationDesign", "testDesign"];
fs.writeFileSync(p, JSON.stringify(s, null, 2));
fs.writeFileSync(process.argv[1] + "/inputs/proposal.md", "# P\n");
fs.writeFileSync(process.argv[1] + "/inputs/requirement-clarification.md", "# C\n");
' "$TASK"
echo '{"reason":"smoke"}' > "$TMP/in.json"
node scripts/devsphere-cli.js design reopen --task-path "$TASK" --design-type businessDesign --mode bogus && echo "SHOULD NOT PRINT"
```

Expected: 最后一条报 `Invalid reopen mode` 且退出码非 0（mode 校验生效）。

- [ ] **Step 2: 全量测试**

Run: `node --test scripts/test/*.test.js`
Expected: 仅 1 个预存失败（`feature-design-skill-contract`），其余全过。

- [ ] **Step 3: 清理**

```bash
rm -rf "$TMP"
```
