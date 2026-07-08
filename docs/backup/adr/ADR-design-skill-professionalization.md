# ADR: 设计 Skill 专业化

## 状态

Proposed

## 背景

当前 `feature-design-business`、`feature-design-solution`、`feature-design-implementation`、`feature-design-test` 已能跑通 MVP，但执行步骤普遍偏薄：

1. 读取输入。
2. 查询知识。
3. 按模板生成文档。
4. 保存 evidence。

这不足以稳定产出高质量业务设计、方案设计、实现设计和测试设计。

## 决策

将具体设计动作沉淀在 Skill 内部：

- 业务设计 Skill 承载需求工程、业务建模、隐性知识挖掘、流程/规则/状态/决策表、需求追溯矩阵。
- 方案设计 Skill 承载 C4、4+1、接口契约、数据流、质量属性场景、STRIDE、ATAM、架构决策。
- 实现设计 Skill 承载 repo evidence、模块/文件/函数影响、调用链、事务并发、幂等、日志监控、测试钩子、回滚。
- 测试设计 Skill 承载 risk-based testing、test pyramid、需求/风险/接口/模块到测试追溯、不可测项和转测准入。
- 评审 Skill 承载多角色交叉评审、blocking/advisory/risk_candidate 结构化和修订闭环。
- 新增 design-quality-gate、design-template-check、design-integration-check 作为横切 Skill。

## 替代方案

### 方案 A：继续保持轻量 Skill

优点：简单、短。

缺点：输出质量高度依赖模型临场能力，无法复用方法。

### 方案 B：把专业方法写进 Template

优点：产物结构清晰。

缺点：模板无法表达执行顺序、失败处理和修订模式。

### 方案 C：把专业方法写进 Agent

优点：角色上下文完整。

缺点：Agent 膨胀，方法不可复用。

## 取舍

选择 Skill 专业化。Skill 是可复用工程能力单元，最适合承载“怎么做”。

## 后果

正面：

- 设计输出质量更稳定。
- 可对 Skill 做 gate、review 和后续 lint。
- Agent 保持短而清晰。

负面：

- Skill 文件会变长，需要 progressive disclosure。
- 需要同步更新 Template 和 Quality Gate。

