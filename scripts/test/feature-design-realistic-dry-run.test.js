'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeTask } = require('./helpers');
const {
  initDesign,
  draftPath,
  artifactPath,
  lintDraft,
  recordReview,
  approveCurrentDesign,
  publish,
  inspectWorkspace,
} = require('../devsphere-design');
const { approveDesign } = require('../devsphere-approval');

const DRAFTS = {
  businessDesign: `---
artifactId: "BD-FEAT-DRY-001"
version: "1.0.0"
---

# 审批任务 SLA 自动升级业务设计

## 目标与范围
审批任务逾期后自动升级并通知上级审批人；不包含组织架构维护。

## 角色、流程与规则
申请人提交，审批人处理，系统按 SLA 升级。重复 webhook 不产生第二次升级。

## 状态、术语与验收
状态为待审批、升级中、已升级、已通过、已拒绝、已撤回。重复事件不重复升级，每次转换可审计。

## 适用性说明
- 复杂规则：生成：覆盖升级幂等与撤回约束。
- 长流程：生成：覆盖多级升级和终态。
- 隐私：生成：操作者标识最小化展示并受权限控制。
- 术语冲突：不适用：沿用审批域术语。

## 关联设计与交接
相关设计可消费升级规则、状态、审计和验收合同。
`,
  solutionDesign: `---
artifactId: "SD-FEAT-DRY-001"
version: "1.0.0"
---

# 审批任务 SLA 自动升级方案设计

## 目标、约束与边界
在不改变组织架构服务的前提下可靠升级；外部 webhook 至少一次投递。

## 架构与模块
调度器发现逾期任务，升级服务执行状态机，Outbox 发布通知，审计模块记录转换。

## 接口、数据与集成
taskId、level 和 eventId 组成幂等键；状态表使用乐观锁；审计表仅追加。

## 质量属性与风险
采用数据库事务加 Outbox，降低跨服务耦合，代价是最终一致；外部查询失败采用退避重试。

## 适用性说明
- 安全：生成：操作者标识按既有权限保护。
- 可靠性：生成：覆盖超时、重试、幂等和降级。
- 数据：生成：覆盖状态、审计和 Outbox 生命周期。
- 部署运维：生成：覆盖告警、开关与重放观测。

## 关联设计与交接
相关活动可消费事务边界、幂等键、乐观锁和失败语义。
`,
  implementationDesign: `---
artifactId: "IMPL-FEAT-DRY-001"
version: "1.0.0"
---

# 审批任务 SLA 自动升级实现设计

## 实现范围与代码影响
新增 EscalationService、OverdueTaskScheduler 和 OutboxPublisher，扩展任务仓储。

## 模块接口与调用链
调度器分页读取候选并调用 escalate(command)；服务在单事务中写任务、审计和 Outbox。

## 错误、并发与数据一致性
唯一约束处理重复事件；乐观锁冲突后重读；外部查询超时不进入写事务。

## 迁移、回滚与可测试性
先添加可空字段和新表，再兼容发布；功能开关控制调度器；仓储、时钟和外部客户端通过端口注入。

## 适用性说明
- 并发：生成：覆盖撤回和升级竞态。
- 迁移：生成：采用向前兼容 DDL。
- 运维：生成：覆盖日志、指标、开关和回滚。
- 资源约束：生成：分页扫描并限制批次。

## 关联设计与交接
实施和测试可消费唯一约束、乐观锁、Outbox 重放和回滚接缝。
`,
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

const CHECKLIST = {
  businessDesign: 'business-coverage',
  solutionDesign: 'architecture-consistency',
  implementationDesign: 'implementation-feasibility',
  testDesign: 'risk-coverage',
};

test('tradeoff-rich feature baselines independent design activities in arbitrary order and synchronizes readiness', () => {
  const { taskPath } = makeTask({ taskId: 'FEAT-DRY-001' });
  const statePath = path.join(taskPath, 'state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  state.status = 'assessed';
  state.requiredDesignTypes = ['businessDesign', 'solutionDesign', 'implementationDesign', 'testDesign'];
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');

  const order = ['testDesign', 'businessDesign', 'implementationDesign', 'solutionDesign'];
  for (const designType of order) {
    initDesign(taskPath, designType);
    fs.writeFileSync(draftPath(taskPath, designType), DRAFTS[designType], 'utf8');
    assert.strictEqual(lintDraft(taskPath, designType).status, 'pass');
    const draftHash = require('../devsphere-design').sha256File(draftPath(taskPath, designType));
    assert.strictEqual(recordReview(taskPath, designType, {
      draftHash,
      checklists: [{ checklistId: CHECKLIST[designType], result: 'pass', summary: '通过', findings: [] }],
      notApplicable: [],
    }).status, 'pass');
    approveCurrentDesign(taskPath, designType, { approvedBy: 'human', acceptedRisks: [] });
    const result = publish(taskPath, designType);
    assert.strictEqual(fs.readFileSync(artifactPath(taskPath, designType), 'utf8'), DRAFTS[designType]);
    if (designType !== 'solutionDesign') assert.strictEqual(result.state.status, 'designing');
  }

  assert.strictEqual(inspectWorkspace(taskPath).recovery, 'needs_design_selection');
  assert.strictEqual(JSON.parse(fs.readFileSync(statePath, 'utf8')).status, 'design_ready');
  const approval = approveDesign(taskPath, { approvedBy: 'human', risks: [], limitations: [] });
  assert.strictEqual(approval.artifacts.length, 4);
  assert.strictEqual(JSON.parse(fs.readFileSync(statePath, 'utf8')).status, 'approved_for_implementation');
});
