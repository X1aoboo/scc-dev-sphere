'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeTask } = require('./helpers');
const { businessDraft } = require('./fixtures/business-design');
const { validateDesignEntry } = require('../workflows/feature-workflow');
const {
  initDesign,
  draftPath,
  artifactPath,
  lintDraft,
  recordReview,
  approveCurrentDesign,
  publish,
  syncDesignState,
  inspectWorkspace,
} = require('../devsphere-design');
const { approveDesign } = require('../devsphere-approval');

const DRAFTS = {
  businessDesign: businessDraft('FEAT-DRY-001', 'existing'),
  solutionDesign: `---
artifactId: "SD-FEAT-DRY-001"
version: "1.0.0"
---

# 审批任务 SLA 自动升级方案设计

## 概述
为审批任务增加 SLA 自动升级，供研发、测试和运维人员共同使用。

## 特性需求与设计上下文
这是存量增强；新增自动升级，影响审批状态和通知，保持组织数据所有权不变，不包含组织架构维护。

## 总体方案
调度器发现逾期任务，升级服务原子创建升级事件，Outbox 异步驱动上级解析、通知和审计。

## 4+1 架构视图

### 场景视图
逾期任务触发一次升级；重复扫描、撤回竞态和通知失败具有明确结果。

### 逻辑视图
审批服务拥有任务状态，组织服务拥有上下级关系，通知服务负责送达。

### 进程视图
扫描、原子建事件、异步消费和通知形成可重试链路，eventId 阻止重复升级。

### 开发视图
审批服务新增调度、升级和 Outbox 组件，通知服务沿用现有消费入口。

### 物理视图
复用现有部署和消息设施，扫描任务使用独立并发配额保护在线请求。

## 接口与集成设计
组织查询设置超时和有限重试，通知事件至少一次投递并以 eventId 幂等。

## 数据设计
审批服务拥有升级状态和 Outbox，审计表只追加，组织关系不复制为权威数据。

## 可靠性、可用性与功能安全设计
依赖失败保留待处理事件并退避重试，积压和重试耗尽触发告警；不涉及功能安全。

## 安全、隐私与韧性设计
沿用审批权限边界，操作者标识最小化展示，通知消费不能绕过租户校验。

## 非功能质量属性设计
扫描批次和并发配额保护在线请求；升级延迟和积压深度可监控、可验证。

## 关键技术决策、取舍与风险
选择事务 Outbox 取得可靠投递，接受通知最终一致；外部组织查询失败采用退避重试。

## 下游设计约束与交接
相关活动可消费事务边界、幂等键、乐观锁、失败语义和质量目标。

## 需求追溯与覆盖关系
自动升级落到调度与升级事件，可靠通知落到 Outbox，审计要求落到追加记录。

## 词汇表
升级事件：一次 SLA 违约产生的唯一业务事件。

## 参考资料
采用当前任务需求、审批状态模型和组织服务接口合同。
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
  businessDesign: 'business-semantic-consistency',
  solutionDesign: 'architecture-consistency',
  implementationDesign: 'implementation-feasibility',
  testDesign: 'risk-coverage',
};

test('tradeoff-rich feature follows the fixed design sequence and synchronizes readiness', () => {
  const { taskPath } = makeTask({ taskId: 'FEAT-DRY-001' });
  const statePath = path.join(taskPath, 'state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  state.status = 'designing';
  state.requiredDesignTypes = ['businessDesign', 'solutionDesign', 'implementationDesign', 'testDesign'];
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# Requirement Baseline\n\nApproved SLA requirement.', 'utf8');

  const order = ['businessDesign', 'solutionDesign', 'implementationDesign', 'testDesign'];
  for (const designType of order) {
    assert.strictEqual(validateDesignEntry(taskPath, designType).valid, true);
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
    publish(taskPath, designType);
    assert.strictEqual(fs.readFileSync(artifactPath(taskPath, designType), 'utf8'), DRAFTS[designType]);
    const synced = syncDesignState(taskPath);
    if (designType !== 'testDesign') assert.strictEqual(synced.status, 'designing');
  }

  assert.strictEqual(inspectWorkspace(taskPath).recovery, 'needs_design_selection');
  assert.strictEqual(JSON.parse(fs.readFileSync(statePath, 'utf8')).status, 'design_ready');
  const approval = approveDesign(taskPath, { approvedBy: 'human', risks: [], limitations: [] });
  assert.strictEqual(approval.artifacts.length, 4);
  assert.strictEqual(JSON.parse(fs.readFileSync(statePath, 'utf8')).status, 'approved_for_implementation');
});
