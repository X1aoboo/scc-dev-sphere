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

### 步骤4：计算 nextAction 并判定任务状态

运行确定性 workflow resolver：

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-workflow.js ${CLAUDE_PROJECT_DIR}
```

resolver 会：
1. 在项目根目录中查找 `.devsphere/current-task.json`
2. 如找到，读取 `current-task.json` 识别 `activeTaskId` 和 `taskType`
3. 加载对应的 resolver（MVP：`scripts/workflows/feature-workflow.js`）
4. 输出 `nextAction` JSON 到 stdout

解析 stdout 中的 JSON 输出到 `nextAction`。

**判定活跃任务：**

检查 `nextAction` 的 `kind` 和 `reason`：

- 如果 `nextAction.kind === 'show_status'` 且 `nextAction.reason` 包含 `'No active task'`：**无活跃任务**，展示：

  ```
  未找到活跃任务。创建 feature 任务请使用：
    /scc-dev-sphere:feature-init

  列出已有任务：/scc-dev-sphere:workflow list
  切换任务：    /scc-dev-sphere:workflow switch <task-id>
  ```
  终止。

- 否则：**有活跃任务**，进入步骤5 处理 nextAction。

### 步骤5：向用户展示 nextAction

根据 `nextAction.kind`：

#### `run_skill`

展示状态摘要：

```
📋 **下一步动作:** {nextAction.reason}

**任务:** {nextAction.taskId}
**状态:** {nextAction.status}
**阶段:** {nextAction.stage || 'N/A'}
**目标:** {nextAction.target || 'N/A'}

**需要的产物:**
{nextAction.requiredArtifacts.map(a => '  - ' + a).join('\n')}

**预期输出:**
{nextAction.expectedArtifacts.map(a => '  - ' + a).join('\n')}
```

然后使用 **AskUserQuestion 工具**获取用户决策（遵循 `references/interaction-guidelines.md` 中的 `single_select` 模式）：

- `header`: "下一步"（≤12字）
- `question`: "{nextAction.reason} 是否继续？"
- `options`:
  - `label: "✅ 继续执行" (Recommended)` `description: "自动执行 {nextAction.skill} skill，加载 {nextAction.agents.join(', ')} Agent"`
  - `label: "⏸️ 暂停"` `description: "暂不执行，稍后手动处理"`
- `multiSelect`: false
- 用户可通过 Other 输入自定义指令

**用户确认后（选择继续）：**

#### 无 Agent 场景（agents 为空）

在 main 会话中直接执行 `nextAction.skill`。完成后根据输出继续派发。

特别地，如果 `nextAction.skill === 'feature-design'`，执行其子编排逻辑得到结构化路由结果（`{ stage, skill, agent/agents, reason }`），然后按下方 Agent 派发逻辑处理该路由结果。

#### 单 Agent 场景（agents 含 1 个元素）

使用 **Agent tool** 派发单个 Agent（`background: true`）：

- agentName: `nextAction.agents[0]`
- model: `"sonnet"`
- prompt 包含：
  - 任务 ID 和路径
  - skill 名称和参数
  - 产物路径

#### 多 Agent 场景（agents 含 2+ 个元素）

**并行**使用 **Agent tool** 派发所有 Agent（每个 `background: true`）：

- 对 `nextAction.agents` 中的每个 agentName，各派发一个 Agent tool
- 每个 Agent 的 prompt 包含相同的 skill 和任务上下文，但注明自身职责视角

#### Agent 完成后

所有 Agent 完成后，显式运行状态同步：

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js sync-stage-status ${CLAUDE_PROJECT_DIR}
```

然后回到步骤4 重新运行 resolver 计算下一步 nextAction。

**如果用户选择暂停：**
保持当前状态，等待用户稍后再次运行 `/scc-dev-sphere:workflow`。

#### `human_confirm`

展示确认信息：

```
⏸️ **需要人工确认**

**任务:** {nextAction.taskId}
**阶段:** {nextAction.stage}
{pause.prompt if nextAction.pause}
```

根据 `nextAction.pause` 内容动态选择 AskUserQuestion 模式（遵循 `references/interaction-guidelines.md`）：

**模式选择逻辑：**
- 如果 pause 内容是确认/取消类决策（如"是否批准？"、"确认继续？"）→ 使用 **`confirm_gate`** 模式
- 如果 pause 内容是多选项决策（如"选择处理方式"、"选择下一个阶段"）→ 使用 **`single_select`** 模式
- 如果 pause 内容需要从非互斥项中选择多项 → 使用 **`multi_select`** 模式

**AskUserQuestion 构造示例：**

**confirm_gate 模式：**
```
header: "人工确认"
question: "{pause.prompt}"
options:
  - label: "✅ 确认继续"
    description: "确认后继续执行当前操作"
  - label: "⏸️ 暂不继续"
    description: "有顾虑需输入说明，请选择 Other"
multiSelect: false
```

**single_select 模式：**
```
header: "选项决策"
question: "{pause.prompt}"
options:
  - （根据 pause 内容动态构造 2-4 个选项，推荐项排在首位）
multiSelect: false
```

用户也可通过 AskUserQuestion 内置的 **Other** 选项自由输入自定义内容。

等待用户选择或输入后再继续。

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

### 步骤6：用户执行后

用户执行推荐的 agent/skill 后，对应的 skill 会生成产物并更新状态。下次调用 `/scc-dev-sphere:workflow` 时，resolver 将基于更新后的持久化状态重新计算 nextAction。

## 约束

- Workflow 不修改状态文件 —— 这是 skill 和 hook 的职责
- Workflow 始终从当前持久化状态重新计算 nextAction（不跨调用缓存）
- Workflow 通过 AskUserQuestion 获取用户确认后，自动派发 Agent 执行；如果用户选择暂停，则不做任何操作
