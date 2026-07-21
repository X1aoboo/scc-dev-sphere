'use strict';

function implementationUnit(serviceName) {
  return `## 微服务实现设计：${serviceName}

### 服务实现上下文
${serviceName} 承接审批任务升级责任，接收逾期任务并产生唯一升级事件，保持既有跨服务契约不变。

### 工程事实与实现范围
真实仓库包含任务应用模块、持久化模块和现有单元测试；本次新增升级服务与调度入口，复用任务仓储，组织维护保持不变。

### 目标实现总览
调度入口发现候选任务，升级服务维护业务不变量，仓储和 Outbox 适配器承担持久化与外部副作用。

### 代码结构、职责与依赖
EscalationService 只依赖任务仓储、Outbox 端口和时钟；框架调度器及数据库适配器依赖核心接口，核心逻辑不依赖框架。

### 接口、类型与不变量
escalate(command) 返回升级结果或明确错误；同一任务版本只允许一个有效升级事件，空任务标识被拒绝。

### 控制流、数据流、状态与持久化
调度器分页读取候选并调用升级服务；服务校验状态后在单一事务中更新任务、追加审计并写入 Outbox。

### 核心算法与技术质量属性
候选扫描按主键分页，单批上限固定，时间复杂度随候选数线性增长；独立并发配额保护在线请求。

### 错误、并发、事务与一致性
乐观锁保护撤回竞态，事件唯一约束保证幂等；外部查询超时不进入写事务，通知失败由 Outbox 重试。

### 兼容、迁移、回滚与运行观测
新增字段先保持可空并兼容旧版本，功能开关控制调度；记录升级结果、重试次数、积压指标和关联 Trace。

### 设计原则、模式选择与关键技术决策
采用事务 Outbox 解决数据库提交与事件投递的原子性矛盾；其额外表和重放组件成本由可靠投递需求覆盖。

### 面向 TDD 的单元行为设计
单元测试从成功升级、重复升级、撤回竞态和时钟边界驱动服务接口；仓储、时钟和 Outbox 通过稳定端口隔离。

### 开发实现计划交接
计划可直接拆分调度入口、升级服务、持久化和 Outbox 切片；事务、幂等、接口和行为约束不得重新设计。
`;
}

function implementationDraft(taskId, services = ['approval-service']) {
  const mappingRows = services.map(serviceName => (
    `| ${serviceName} | 存量 | 承担审批任务自动升级 | services/${serviceName} | application、persistence | 微服务实现设计：${serviceName} |`
  )).join('\n');
  const units = services.map(implementationUnit).join('\n');
  const applicabilityRows = services.map(serviceName => (
    `| ${serviceName} | 并发与迁移 | 完整设计 | 核验任务写入、事件投递和混合版本，存在实质影响 | 错误、并发、事务与一致性；兼容、迁移、回滚与运行观测 |`
  )).join('\n');

  return `---
artifactId: "IMPL-${taskId}"
version: "1.0.0"
---

# Implementation Design

## 概述
为审批任务增加 SLA 自动升级，本文供开发实现计划、编码和测试设计消费。

## 上游设计基线
Solution Design 已确定 ${services.join('、') || '当前范围内的微服务'} 承担服务内实现责任，跨服务契约、数据所有权和最终一致语义保持不变。

## 微服务实现范围与代码仓映射
| 微服务 | 新增/存量 | 上游已确定责任 | 代码仓或新工程 | 构建模块/产物 | 详细设计位置 |
|---|---|---|---|---|---|
${mappingRows}

## 公共工程约束与设计追溯
所有服务沿用 Node.js 工程基线、结构化日志、Trace 传播和 node:test；依据是正式 Solution Design 与仓库配置。

${units}
## 适用性与裁剪说明
| 微服务 | 设计维度 | 处理方式 | 核验范围与依据 | 正文落点 |
|---|---|---|---|---|
${applicabilityRows}

## 实现级开放事项与升级项
经核验没有会迫使开发计划重新进行关键设计的开放事项；组织服务长期不可用作为已接受残余风险。

## 词汇表
升级事件：一次 SLA 违约产生的唯一业务事件。Outbox：与业务状态同事务持久化的待投递事件。

## 参考资料
采用 Requirement、Business Design、Solution Design Baseline，以及任务仓储、调度入口和 Outbox 工程事实。
`;
}

module.exports = { implementationDraft };
