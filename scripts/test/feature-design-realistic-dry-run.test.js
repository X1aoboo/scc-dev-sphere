'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeTask } = require('./helpers');
const { businessDraft, installBusinessAssets } = require('./fixtures/business-design');
const {
  implementationDraft,
  installImplementationAssets,
} = require('./fixtures/implementation-design');
const { installSolutionAssets, solutionDraft } = require('./fixtures/solution-design');
const { validateDesignEntry } = require('../workflows/feature-workflow');
const {
  initDesign,
  draftPath,
  artifactAssetsPath,
  artifactPath,
  lintDraft,
  reviewContext,
  recordReview,
  validateReview,
  reviewReportPath,
  approveCurrentDesign,
  publish,
  syncDesignState,
  inspectWorkspace,
  readDraftRef,
} = require('../devsphere-design');
const { approveDesign } = require('../devsphere-approval');

const DRAFTS = {
  businessDesign: businessDraft('FEAT-DRY-001'),
  solutionDesign: solutionDraft('FEAT-DRY-001'),
  implementationDesign: implementationDraft('FEAT-DRY-001'),
  testDesign: `---
artifactId: "TD-FEAT-DRY-001"
version: "1.0.0"
---

# 审批任务 SLA 自动升级测试设计

## 风险与测试范围
最高风险是重复升级、撤回竞态、通知丢失和审计缺口。

## 测试策略与场景
单元测试状态机；集成测试唯一约束、乐观锁和 Outbox；契约测试组织架构及 webhook；端到端测试逾期升级。

## 数据、环境与自动化
固定时钟生成重复 eventId 和多级审批链；CI 使用隔离数据库并等待可观察 Outbox 状态。

## 不可测项与转测准入
生产级供应商抖动通过故障注入近似；转测要求迁移演练、开关验证、集成和契约测试通过。

## 适用性说明
- 安全：生成：覆盖审计权限。
- 性能：生成：覆盖批量扫描。
- 兼容性：生成：覆盖新旧版本共同运行。
- 迁移外部集成：生成：覆盖 DDL、webhook 和故障注入。

## 关联设计与交接
验证活动可消费测试场景、数据、环境、自动化和准入条件。
`,
};

test('tradeoff-rich feature follows the fixed design sequence and synchronizes readiness', () => {
  const { taskPath } = makeTask({ taskId: 'FEAT-DRY-001' });
  const statePath = path.join(taskPath, 'state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  state.status = 'designing';
  state.requiredDesignTypes = ['businessDesign', 'solutionDesign', 'implementationDesign', 'testDesign'];
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
  fs.writeFileSync(path.join(taskPath, 'inputs', 'proposal.md'), '# Proposal\n\nDetailed SLA requirement.', 'utf8');
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement-clarification.md'), '# Clarification\n\nApproved clarification.', 'utf8');

  const order = ['businessDesign', 'solutionDesign', 'implementationDesign', 'testDesign'];
  for (const designType of order) {
    assert.strictEqual(validateDesignEntry(taskPath, designType).valid, true);
    initDesign(taskPath, designType);
    fs.writeFileSync(draftPath(taskPath, designType), DRAFTS[designType], 'utf8');
    if (designType === 'businessDesign') installBusinessAssets(taskPath);
    if (designType === 'implementationDesign') installImplementationAssets(taskPath);
    if (designType === 'solutionDesign') installSolutionAssets(taskPath);
    assert.strictEqual(lintDraft(taskPath, designType).status, 'pass');
    const context = reviewContext(taskPath, designType);
    assert.strictEqual(recordReview(taskPath, designType, {
      reviewKey: context.reviewKey,
      draftHash: context.draft.draftHash,
      policyHash: context.policyHash,
      baseReportHash: context.report.hash,
      reportAppend: `# Design Review Baseline\n\n- Design type: ${designType}\n`,
      checklists: [...context.requiredChecklists, ...context.conditionalChecklists].map(({ checklistId }) => ({
        checklistId,
        result: 'pass',
        summary: '通过',
        findings: [],
      })),
      notApplicable: [],
    }).status, 'pass');
    approveCurrentDesign(taskPath, designType, { approvedBy: 'human', acceptedRisks: [] });
    publish(taskPath, designType);
    assert.strictEqual(fs.readFileSync(artifactPath(taskPath, designType), 'utf8'), DRAFTS[designType]);
    if (designType === 'businessDesign') {
      assert.strictEqual(
        fs.existsSync(path.join(artifactAssetsPath(taskPath, designType), 'ucd', 'escalation-list-business-concept.svg')),
        true,
      );
    }
    if (designType === 'solutionDesign') {
      assert.strictEqual(
        fs.existsSync(path.join(artifactAssetsPath(taskPath, designType), 'ucd', 'escalation-list-wireframe.svg')),
        true,
      );
    }
    const synced = syncDesignState(taskPath);
    if (designType !== 'testDesign') assert.strictEqual(synced.status, 'designing');
  }

  assert.strictEqual(inspectWorkspace(taskPath).recovery, 'needs_design_selection');
  assert.strictEqual(JSON.parse(fs.readFileSync(statePath, 'utf8')).status, 'design_ready');
  const approval = approveDesign(taskPath, { approvedBy: 'human', risks: [], limitations: [] });
  assert.strictEqual(approval.artifacts.length, 4);
  assert.strictEqual(JSON.parse(fs.readFileSync(statePath, 'utf8')).status, 'approved_for_implementation');
});

test('incremental Review context exposes the persisted ledger after a local Draft change', () => {
  const { taskPath } = makeTask({ taskId: 'FEAT-DRY-INCREMENTAL' });
  initDesign(taskPath, 'businessDesign');
  fs.writeFileSync(draftPath(taskPath, 'businessDesign'), businessDraft('FEAT-DRY-INCREMENTAL'), 'utf8');
  installBusinessAssets(taskPath);
  assert.strictEqual(lintDraft(taskPath, 'businessDesign').status, 'pass');

  const initial = reviewContext(taskPath, 'businessDesign');
  const advisory = {
    type: 'advisory',
    location: '异常、边界与业务结果',
    issue: '未选择在本轮处理的提示文案问题',
    impact: '提示仍可更直接',
    recommendation: '后续优化提示文案',
  };
  recordReview(taskPath, 'businessDesign', {
    reviewKey: initial.reviewKey,
    draftHash: initial.draft.draftHash,
    policyHash: initial.policyHash,
    baseReportHash: null,
    reportAppend: '# Design Review Baseline\n\n- [x] 全部原始评审项已执行。\n',
    checklists: initial.requiredChecklists.map(({ checklistId }, index) => ({
      checklistId,
      result: index === 0 ? 'findings' : 'pass',
      summary: index === 0 ? '保留一项 advisory' : '通过',
      findings: index === 0 ? [advisory] : [],
    })),
    notApplicable: initial.conditionalChecklists.map(({ checklistId }) => ({
      checklistId,
      reason: '本次业务设计不涉及存量变更',
    })),
  });
  const baseline = fs.readFileSync(reviewReportPath(taskPath, 'businessDesign'), 'utf8');

  fs.appendFileSync(draftPath(taskPath, 'businessDesign'), '\n补充用户已确认的局部业务结果。\n');
  assert.strictEqual(lintDraft(taskPath, 'businessDesign').status, 'pass');
  const incremental = reviewContext(taskPath, 'businessDesign');
  assert.strictEqual(incremental.reviewMode, 'incremental');
  assert.deepStrictEqual(incremental.previousReview.findingSummary, {
    blocking: 0,
    advisory: 1,
    risk: 0,
    total: 1,
  });
  assert.strictEqual(incremental.report.hash, incremental.previousReview.reportHash);

  const reportAppend = '\n## Round 2 — Incremental Review\n\n- [x] 仅复评受局部修改影响的评审项；旧 advisory 保留。\n';
  recordReview(taskPath, 'businessDesign', {
    reviewKey: incremental.reviewKey,
    draftHash: incremental.draft.draftHash,
    policyHash: incremental.policyHash,
    baseReportHash: incremental.report.hash,
    reportAppend,
    checklists: incremental.requiredChecklists.map(({ checklistId }, index) => ({
      checklistId,
      result: index === 0 ? 'findings' : 'pass',
      summary: index === 0 ? '保留一项 advisory' : '通过',
      findings: index === 0 ? [advisory] : [],
    })),
    notApplicable: incremental.conditionalChecklists.map(({ checklistId }) => ({
      checklistId,
      reason: '本次业务设计不涉及存量变更',
    })),
  });
  assert.strictEqual(
    fs.readFileSync(reviewReportPath(taskPath, 'businessDesign'), 'utf8'),
    `${baseline}${reportAppend}`,
  );
  assert.strictEqual(validateReview(taskPath, 'businessDesign').valid, true);
});
