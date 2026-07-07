---
name: feature-design
description: 设计编排入口。读取 state.json，只推进当前允许推进的下一个设计阶段。不会自动覆盖已人工批准的阶段产物，除非使用 --mode revise。
---

# Feature Design — 设计编排

编排设计阶段的推进。本 skill 是设计阶段的唯一编排入口——读取当前状态，按工作流模式自动推进多个设计阶段，在需要时暂停等待用户确认。

与 `feature-workflow.js` resolver 配合工作：resolver 判断整体状态并推荐 `feature-design`，本 skill 负责内部阶段路由和 Agent 派发的具体执行。

## 集成契约

- **入口:** `/scc-dev-sphere:feature-design [--mode revise]`
- **入参:** 当前 state.json
- **输出:** 推进一个或多个设计阶段（business → solution → implementation → test → integrated）
- **完成标准:** 推进到所有阶段完成或被用户暂停

## 执行

### 步骤1：读取状态

1. 读取 `state.json`，获取 `workflowMode` 和 `stages` 中各个阶段的状态。
2. 按阶段顺序 [businessDesign, solutionDesign, implementationDesign, testDesign] 找出第一个未完成阶段。
3. 如果所有阶段已完成 → 跳到步骤4（生成集成设计）。

### 步骤2：执行当前阶段

1. 根据当前阶段名称确定对应的 Agent：
   - businessDesign → SA Agent（`feature-design-business` skill）
   - solutionDesign → SE Agent（`feature-design-solution` skill）
   - implementationDesign → MDE Agent（`feature-design-implementation` skill）
   - testDesign → TSE Agent（`feature-design-test` skill）

2. **不覆盖已 `human_approved` 的阶段**（除非使用 `--mode revise` 参数）。

3. 加载对应 Agent，使用 Agent tool（`background: true`）执行：
   - agent 名：对应角色的 agent 名称
   - prompt 上下文：当前阶段 skill 名称、任务 ID 和路径
   - `--mode revise`：如果传入该参数，在 Agent 上下文中标记修订模式

### 步骤3：检查轮回（按工作流模式决定）

阶段任务完成后，检查状态并决定是否继续：

**如果 `workflowMode === 'auto-design'`：**
- 自动回到步骤1，推进下一个阶段
- 不向用户展示中间状态，连贯推进直到所有阶段完成或被阻塞

**如果 `workflowMode === 'strict-human-loop'`：**
- 在每阶段完成后暂停
- 使用 **AskUserQuestion**（遵循 `single_select` 模式）：
  - `header`: "阶段完成"
  - `question`: "当前阶段 {阶段名} 已完成。是否继续下一阶段 {下一阶段名}？"
  - `options`:
    - `label: "✅ 继续下一阶段 (Recommended)"` `description: "开始下一阶段设计工作"`
    - `label: "⏸️ 暂停"` `description: "暂停编排流程"`
  - `multiSelect`: false
  - 用户选择继续 → 回到步骤1
  - 用户选择暂停 → 展示步骤5 的完成摘要

**如果 `workflowMode === 'collaborative-design'`：**
- 根据 `state.humanGateStages` 判断下一阶段是否需要人工门禁
- 如果下一阶段在 humanGateStages 中 → 使用同上 AskUserQuestion 暂停
- 如果下一阶段不在 humanGateStages 中 → 自动回到步骤1

### 步骤4：生成集成设计

当全部 4 个阶段达到要求状态后：
1. 加载 SA、SE、MDE、TSE Agent 分别执行各自的集成部分
2. 生成/刷新 `artifacts/integrated-design.md`
3. 如果 `integrated-design.md` 已存在且所有阶段未变更 → 跳过（避免无变更生成）

### 步骤5：完成

展示完成摘要：

```
📋 设计阶段完成摘要

**已完成阶段:**
{列出所有已达 ai_review_passed 或 human_approved 的阶段及状态}

**集成设计:** artifacts/integrated-design.md

**下一步:** /scc-dev-sphere:workflow
  → 进入评审或推进到下一阶段。
```

## 约束

- 绝不覆盖已 `human_approved` 的阶段，除非使用 `--mode revise`
- 不修改状态文件 —— 状态更新由各阶段 skill 负责（通过各自的执行步骤和 hook）
- 不执行评审 —— 评审由 `feature-review` skill 在 workflow 层面处理
- 不处理 `human_confirm` —— 这是 resolver 和 workflow 的职责
