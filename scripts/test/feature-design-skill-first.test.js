'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeTask } = require('./helpers');
const {
  DESIGN_TYPES,
  initDesign,
  inspectWorkspace,
  inspectDesign,
  lintDraft,
  recordReview,
  refreshFormattingReview,
  approveCurrentDesign,
  publish,
  reopenDesign,
  designReady,
  draftPath,
  artifactPath,
  sha256File,
} = require('../devsphere-design');

const VALID_DRAFT = `---
artifactId: "BD-FEAT-TEST-001"
version: "1.0.0"
---

# 业务设计

## 目标与范围
支持审批流，明确排除计费。

## 角色、流程与规则
申请人提交，审批人审批。审批通过后生效。

## 状态、术语与验收
状态为待审批、已通过、已拒绝。通过后可查询生效结果。

## 适用性说明
- 复杂规则：不适用：没有组合判断。
- 长流程：不适用：只有单次审批。
- 隐私：不适用：不处理个人数据。
- 术语冲突：不适用：沿用现有词汇。

## 关联设计与交接
其他设计可消费审批状态和生效规则。
`;

function setRequired(taskPath, designTypes) {
  const statePath = path.join(taskPath, 'state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  state.requiredDesignTypes = designTypes;
  state.status = 'assessed';
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
}

function writeDraft(taskPath, designType, content = VALID_DRAFT) {
  initDesign(taskPath, designType);
  fs.writeFileSync(draftPath(taskPath, designType), content, 'utf8');
}

function passingSummary(taskPath, designType) {
  return {
    draftHash: sha256File(draftPath(taskPath, designType)),
    checklists: [{ checklistId: 'business-coverage', result: 'pass', summary: '通过', findings: [] }],
    notApplicable: [],
  };
}

function completeBusiness(taskPath) {
  writeDraft(taskPath, 'businessDesign');
  assert.strictEqual(lintDraft(taskPath, 'businessDesign').status, 'pass');
  assert.strictEqual(recordReview(taskPath, 'businessDesign', passingSummary(taskPath, 'businessDesign')).status, 'pass');
  approveCurrentDesign(taskPath, 'businessDesign', { approvedBy: 'human', acceptedRisks: [] });
  return publish(taskPath, 'businessDesign');
}

test('workspace stores required design types but no internal design cursor', () => {
  const { taskPath } = makeTask();
  const state = JSON.parse(fs.readFileSync(path.join(taskPath, 'state.json'), 'utf8'));
  assert.deepStrictEqual(state.requiredDesignTypes, ['businessDesign', 'solutionDesign', 'implementationDesign', 'testDesign']);
  assert.strictEqual(state.currentDesignType, undefined);
  assert.strictEqual(state.stages, undefined);
});

test('workspace inference uses unfinished work instead of a fixed type order', () => {
  const { taskPath } = makeTask();
  assert.strictEqual(inspectWorkspace(taskPath).recovery, 'needs_design_selection');

  initDesign(taskPath, 'testDesign');
  const inferred = inspectWorkspace(taskPath);
  assert.strictEqual(inferred.recovery, 'design_inferred');
  assert.strictEqual(inferred.designType, 'testDesign');
});

test('any design type can start without an upstream baseline', () => {
  const { taskPath } = makeTask();
  assert.doesNotThrow(() => initDesign(taskPath, 'implementationDesign'));
  assert.strictEqual(inspectWorkspace(taskPath).designType, 'implementationDesign');
});

test('multiple unfinished activities or conflicting persisted facts require user confirmation', () => {
  const { taskPath } = makeTask();
  initDesign(taskPath, 'solutionDesign');
  initDesign(taskPath, 'testDesign');
  assert.strictEqual(inspectWorkspace(taskPath).recovery, 'needs_user_confirmation');

  const other = makeTask().taskPath;
  writeDraft(other, 'businessDesign');
  fs.writeFileSync(artifactPath(other, 'businessDesign'), VALID_DRAFT.replace('1.0.0', '0.9.0'), 'utf8');
  assert.strictEqual(inspectDesign(other, 'businessDesign').recovery, 'needs_user_confirmation');
});

test('lint checks structure and explicit applicability without semantic judgement', () => {
  const { taskPath } = makeTask();
  writeDraft(taskPath, 'businessDesign');
  const pass = lintDraft(taskPath, 'businessDesign');
  assert.strictEqual(pass.status, 'pass');
  assert.ok(pass.checks.every(check => check.kind !== 'semantic'));

  fs.writeFileSync(draftPath(taskPath, 'businessDesign'), VALID_DRAFT.replace('## 关联设计与交接', '## {{TODO}}'), 'utf8');
  assert.strictEqual(lintDraft(taskPath, 'businessDesign').status, 'fail');
});

test('review summary is hash-bound, minimal, and blocks only blocking findings', () => {
  const { taskPath } = makeTask();
  writeDraft(taskPath, 'businessDesign');
  lintDraft(taskPath, 'businessDesign');
  const summary = passingSummary(taskPath, 'businessDesign');
  summary.checklists[0] = {
    checklistId: 'business-coverage',
    result: 'findings',
    summary: '一项建议',
    findings: [{
      type: 'advisory',
      location: '状态、术语与验收',
      issue: '拒绝提示可以更明确',
      impact: '用户可能需要再次确认结果',
      recommendation: '补充用户可见结果',
    }],
  };
  assert.strictEqual(recordReview(taskPath, 'businessDesign', summary).status, 'pass');
  summary.checklists[0].findings[0].type = 'blocking';
  assert.strictEqual(recordReview(taskPath, 'businessDesign', summary).status, 'blocked');
});

test('semantic revision invalidates review while formatting-only change can refresh it', () => {
  const { taskPath } = makeTask();
  writeDraft(taskPath, 'businessDesign');
  lintDraft(taskPath, 'businessDesign');
  recordReview(taskPath, 'businessDesign', passingSummary(taskPath, 'businessDesign'));

  fs.appendFileSync(draftPath(taskPath, 'businessDesign'), '\n业务语义改变。\n');
  assert.strictEqual(inspectDesign(taskPath, 'businessDesign').review.valid, false);

  fs.writeFileSync(draftPath(taskPath, 'businessDesign'), `${VALID_DRAFT}\n\n`, 'utf8');
  lintDraft(taskPath, 'businessDesign');
  const refreshed = refreshFormattingReview(taskPath, 'businessDesign');
  assert.strictEqual(refreshed.draftHash, sha256File(draftPath(taskPath, 'businessDesign')));
});

test('publish copies the approved Draft byte-for-byte and synchronizes state', () => {
  const { taskPath } = makeTask();
  setRequired(taskPath, ['businessDesign']);
  const result = completeBusiness(taskPath);
  assert.strictEqual(fs.readFileSync(result.artifactPath, 'utf8'), VALID_DRAFT);
  assert.strictEqual(result.state.status, 'design_ready');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(taskPath, 'state.json'), 'utf8')).status, 'design_ready');
});

test('reopen operates on one independent design and returns the task to designing', () => {
  const { taskPath } = makeTask();
  setRequired(taskPath, ['businessDesign']);
  completeBusiness(taskPath);
  const reopened = reopenDesign(taskPath, 'businessDesign');
  assert.ok(fs.existsSync(reopened.historyFile));
  assert.match(fs.readFileSync(reopened.draft, 'utf8'), /version: "2\.0\.0"/);
  assert.strictEqual(reopened.state.status, 'designing');
  assert.strictEqual(designReady(taskPath).valid, false);
});

test('design type metadata has no order or upstream contracts', () => {
  for (const definition of Object.values(DESIGN_TYPES)) {
    assert.strictEqual(definition.upstream, undefined);
    assert.strictEqual(definition.next, undefined);
    assert.ok(definition.slug);
  }
});
