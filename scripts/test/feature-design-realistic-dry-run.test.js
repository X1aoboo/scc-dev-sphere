'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeTask } = require('./helpers');
const { businessDraft } = require('./fixtures/business-design');
const { implementationDraft } = require('./fixtures/implementation-design');
const { installSolutionAssets, solutionDraft } = require('./fixtures/solution-design');
const { validateDesignEntry } = require('../workflows/feature-workflow');
const {
  initDesign,
  draftPath,
  artifactAssetsPath,
  artifactPath,
  lintDraft,
  recordReview,
  approveCurrentDesign,
  publish,
  syncDesignState,
  inspectWorkspace,
  readDraftRef,
} = require('../devsphere-design');
const { approveDesign } = require('../devsphere-approval');

const DRAFTS = {
  businessDesign: businessDraft('FEAT-DRY-001', 'existing'),
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

const CHECKLISTS = {
  businessDesign: ['business-semantic-consistency'],
  solutionDesign: [
    'architecture-consistency',
    'architecture-documentation-quality',
    'design-traceability',
  ],
  implementationDesign: ['implementation-feasibility'],
  testDesign: ['risk-coverage'],
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
    if (designType === 'solutionDesign') installSolutionAssets(taskPath);
    assert.strictEqual(lintDraft(taskPath, designType).status, 'pass');
    const draftHash = readDraftRef(taskPath, designType).hash;
    assert.strictEqual(recordReview(taskPath, designType, {
      draftHash,
      checklists: CHECKLISTS[designType].map(checklistId => ({
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
