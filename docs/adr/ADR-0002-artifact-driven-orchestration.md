# ADR-0002: 采用产物 + 状态驱动流程编排

## 状态

Accepted

## 背景

MVP 已经使用 `.devsphere/tasks/feature/<task-id>/state.json` 和阶段产物驱动部分流程，但仍存在模型声明成功、提示词内路由、artifact 无版本、approval 不锁 hash 等风险。Agentic SDLC 需要可复盘和可验证，不能只依赖聊天上下文。

## 决策

采用“产物 + 状态”驱动机制：

- Workflow resolver 读取 state、artifact registry、review matrix、decision、approval、evidence、gate result。
- Skill 的主要职责是生成或更新约定产物。
- 状态推进只依据可检查事实和人工确认记录。
- 每个关键 artifact 有 ID、version、hash、status、owner、dependsOn。

## 替代方案

### 方案 A：Prompt-driven

Agent/Skill 执行后用自然语言说明“完成了”，workflow 继续下一步。

优点：实现简单。

缺点：不可审计，不可稳定恢复，容易错过产物缺失。

### 方案 B：全局 Workflow DSL

构建复杂状态 DSL、guard 表达式和执行引擎。

优点：形式化程度高。

缺点：超出 Claude Code plugin 边界，会变成自建 runtime。

### 方案 C：只依赖 Git

把每次变更都交给 Git diff 和 commit 追踪。

优点：版本化天然存在。

缺点：无法表达业务状态、人工确认、review issue 和知识候选。

## 取舍

产物 + 状态驱动在可控性和实现复杂度之间最平衡。它不要求自建 runtime，但能把关键事实落盘，并允许脚本和 Hook 校验。

## 后果

正面：

- 支持跨会话恢复。
- 支持批准锁定版本。
- 支持变更影响分析。
- 支持质量门禁和可追溯。

负面：

- 需要维护 artifact registry。
- Skill 输出格式需要更严格。
- 老任务工作区需要迁移或兼容。

## 执行要求

- 所有关键 artifact 必须注册。
- 所有 approval 必须引用 artifact hash。
- 所有状态变化必须记录 trace event。
- Resolver 不读取模型口头成功声明，只读取落盘事实。

