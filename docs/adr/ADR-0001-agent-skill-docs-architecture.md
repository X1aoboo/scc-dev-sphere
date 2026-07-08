# ADR-0001: 采用 Agent -> Skill -> Docs 三层架构

## 状态

Accepted

## 背景

`scc-dev-sphere` 的目标是把团队软件研发流程转成 Claude Code plugin。当前 MVP 已包含 `agents/`、`skills/`、`docs/`、`scripts/`、`hooks/` 和运行时 `.devsphere` 工作区。下一阶段需要明确 Agent、Skill、Docs 的职责边界，避免流程语义分散在角色提示词、Skill 提示词和聊天上下文里。

## 决策

采用 Agent -> Skill -> Docs 三层架构：

- Agent：职责视角和专业判断边界。
- Skill：可复用工作方法、步骤、输入输出和失败处理。
- Docs：长期事实源、规范、模板、知识、ADR 和过程产物。

Workflow、scripts 和 hooks 作为 harness：负责状态、registry、quality gate、trace 和确定性校验，不属于三层业务语义的一层。

## 替代方案

### 方案 A：Agent 主轴

让 SA/SE/MDE/DEV/TSE 等 Agent 自行协作和推进流程。

优点：贴近团队组织语义。

缺点：流程推进容易隐藏在 Agent 对话里；状态、批准、证据和质量门禁难以稳定；角色会膨胀。

### 方案 B：Skill 主轴

所有能力都做成 Skill，Agent 只作为可选提示。

优点：复用性强，接近 Claude Code 插件机制。

缺点：缺少专业评审视角；复杂设计活动容易失去角色边界。

### 方案 C：Docs/Spec 主轴

全部围绕 spec 文件和 checklist，Agent/Skill 只是辅助。

优点：可追溯强。

缺点：执行能力不足，容易变成静态文档系统。

## 取舍

最终选择三层架构，并规定：

1. Agent 不推进流程。
2. Skill 不拥有长期知识。
3. Docs 不只做说明，必须被引用、校验和更新。
4. 状态推进由 resolver + artifacts + gates 决定。

## 后果

正面：

- 职责边界清晰。
- 后续可新增 Skill 或 Docs，不必新增 Agent。
- 支持渐进式上下文加载。
- 支持产物驱动和可追溯。

负面：

- 需要维护更多 registry 和 gate。
- 初期实现比纯提示词流程复杂。
- 需要防止 Docs、Skill、Script 三处规则漂移。

## 执行要求

- 所有新增 Agent 必须通过角色建模表评估。
- 所有新增 Skill 必须声明输入、输出、完成标准和失败处理。
- 所有长期知识必须进入 `docs/knowledge` 或 ADR，不写入 Agent 提示词。

