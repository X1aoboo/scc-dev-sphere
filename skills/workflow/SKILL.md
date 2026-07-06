---
name: workflow
description: scc-dev-sphere 主编排入口。读取当前任务状态，计算下一步合法动作，引导对应 Agent/Skill 执行。用于推进任何活跃任务。
---

# Workflow — 主编排入口

你是 scc-dev-sphere 插件的主工作流入口。你的职责是读取持久化任务状态，通过确定性 workflow resolver 计算下一步合法动作，并引导用户执行。

## 集成契约

- **入口:** `/scc-dev-sphere:workflow [list|switch <task-id>]`
- **入参:** 可选子动作通过 `$ARGUMENTS` 传入
- **输出:** nextAction 展示给用户
- **完成标准:** nextAction 计算并呈现

## 执行步骤

### 步骤1：解析参数

检查 `$ARGUMENTS`：
- `list` → 列出 `.devsphere/tasks/` 下所有任务及其状态
- `switch <task-id>` → 更新 `current-task.json` 指向指定任务
- （空）→ 计算当前活跃任务的下一步动作

### 步骤2：处理 `list` 子动作

如果 `$ARGUMENTS` 以 `list` 开头：

1. 读取 `.devsphere/tasks/` 下的所有子目录
2. 对每个任务目录，读取其 `state.json`
3. 展示每个任务的 taskId、status 和当前阶段

格式化输出为表格或列表。完成后终止。

### 步骤3：处理 `switch` 子动作

如果 `$ARGUMENTS` 以 `switch` 开头：

提取 `<task-id>`（`switch` 之后的第二个词）。

验证任务是否存在：检查 `.devsphere/tasks/<task-id>/state.json` 是否存在。如果不存在，显示错误并列出可用任务。

切换时更新 `.devsphere/current-task.json`：
```json
{
  "activeTaskId": "<task-id>",
  "activeTaskType": "feature",
  "taskPath": ".devsphere/tasks/<task-id>"
}
```

切换后显示：
```
已切换到任务: <task-id>
运行 /scc-dev-sphere:workflow 查看下一步动作。
```
完成后终止。

### 步骤4：无活跃任务时

如果 `.devsphere/current-task.json` 不存在或缺少 `activeTaskId`，显示：

```
未找到活跃任务。创建 feature 任务请使用：
  /scc-dev-sphere:feature-init

列出已有任务：/scc-dev-sphere:workflow list
切换任务：    /scc-dev-sphere:workflow switch <task-id>
```
终止。

### 步骤5：计算 nextAction

运行确定性 workflow resolver。从会话上下文中的 **Base directory** 信息推算出插件根目录（本 skill 位于 `skills/workflow/`，向上两级即为插件根目录），拼接出脚本绝对路径后执行：

```bash
node <插件根目录>/scripts/devsphere-workflow.js .
```

resolver 会：
1. 读取 `.devsphere/current-task.json`
2. 识别 `taskType`
3. 加载对应的 resolver（MVP：`scripts/workflows/feature-workflow.js`）
4. 输出 `nextAction` JSON 到 stdout

解析 stdout 中的 JSON 输出。

### 步骤6：向用户展示 nextAction

根据 `nextAction.kind`：

#### `run_skill`

展示：
```
📋 **下一步动作:** {nextAction.reason}

**任务:** {nextAction.taskId}
**状态:** {nextAction.status}
**阶段:** {nextAction.stage || 'N/A'}
**目标:** {nextAction.target || 'N/A'}

**建议动作:**
  Skill: /scc-dev-sphere:{nextAction.skill}
  Agent(s): {nextAction.agents.join(', ')}

**需要的产物:**
{nextAction.requiredArtifacts.map(a => '  - ' + a).join('\n')}

**预期输出:**
{nextAction.expectedArtifacts.map(a => '  - ' + a).join('\n')}
```

然后引导用户执行推荐的 skill。例如：
- 如果 `skill=feature-design-business` 且 `agents=[sa]`：调用 SA Agent，指示其执行 `feature-design-business` skill。
- 如果 `skill=feature-review` 且 `agents=[se]`：调用 SE Agent，使用 `feature-review` skill 及 `--target` 参数（来自 `nextAction.args.target`）。

使用 Agent tool 调用推荐的 Agent，将 skill 名称和参数作为上下文传入。

**重要：** workflow 本身不生成设计、不执行评审、不修改状态。它只告诉用户下一步该做什么。

#### `human_confirm`

展示：
```
⏸️ **需要人工确认**

**任务:** {nextAction.taskId}
**阶段:** {nextAction.stage}
{pause.prompt if nextAction.pause}

请回复以继续。
```

等待用户回复后再继续。

#### `show_status`

展示 `nextAction.reason` 中的状态信息。建议使用 `/scc-dev-sphere:status` 查看完整详情。

#### `blocked`

展示：
```
🚫 **已阻塞**

{nextAction.reason}

查看完整状态: /scc-dev-sphere:status
```

#### `completed`

展示：
```
✅ **任务完成**

{nextAction.reason}

查看完整状态: /scc-dev-sphere:status
```

### 步骤7：用户执行后

用户执行推荐的 agent/skill 后，对应的 skill 会生成产物并更新状态。下次调用 `/scc-dev-sphere:workflow` 时，resolver 将基于更新后的持久化状态重新计算 nextAction。

## 约束

- Workflow 不直接执行 agent/skill 动作 —— 只提供建议
- Workflow 不修改状态文件 —— 这是 skill 和 hook 的职责
- Workflow 始终从当前持久化状态重新计算 nextAction（不跨调用缓存）
