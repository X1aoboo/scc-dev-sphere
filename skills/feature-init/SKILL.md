---
name: feature-init
description: 创建新的需求开发任务工作区。初始化 .devsphere 任务目录、state.json 和 current-task.json。新需求和存量功能调整统一作为 feature task 处理。
---

# Feature Init — 创建需求任务

在 `.devsphere/tasks/feature/<task-id>/` 下创建新的 feature 任务工作区。

## 集成契约

- **入口:** `/scc-dev-sphere:feature-init`
- **入参:** 任务 ID（必选，默认为 `FEAT-<精炼摘要>`，支持自定义）、需求描述（来自用户）
- **输出:** 任务工作区（含 `state.json`，status=initialized），`current-task.json` 已更新
- **完成标准:** `state.json` 存在且 status=initialized，目录结构已创建

## 执行步骤

### 步骤1：收集需求描述

直接在对话中以自然语言向用户提问。此场景为开放式输入，不适合使用选项卡式交互。

**每次只问一个问题。** 首先提问：

> 请提供你的需求描述。可以是一段话、多段详细说明，或直接粘贴需求文档内容。

用户回复后，将需求描述写入 `inputs/requirement.md`（仅原始需求），然后进入步骤2。

注意：用户可能提供多段、带换行的需求文本。不要截断，完整保留用户输入。

### 步骤2：生成任务 ID

从步骤1的需求文本中提炼精炼摘要作为默认 ID。精炼摘要须去除空格（空格替换为连字符 `-`），确保 ID 可用作目录名。示例如下：

| 需求内容 | 默认 ID |
|---------|---------|
| 个人博客系统，支持 Markdown 文章管理、标签分类、全文搜索 | `FEAT-个人博客系统` |
| 优化文章编辑器的图片上传功能和相册管理 | `FEAT-编辑器图片优化` |

使用 `AskUserQuestion`（single_select）呈现：

> **任务 ID 确认**
>
> 默认 ID: `FEAT-<精炼摘要>`
> - **使用默认 ID（推荐）** — 自动使用 FEAT-<精炼摘要>
> - **自定义输入** — 自行填入任务 ID

- 选择"使用默认 ID" → 直接使用
- 选择"自定义输入" → 以自然语言提问"请提供你需要的任务 ID"
  - 用户输入非空 → 去除空格后使用该 ID
  - 用户留空 → 退回默认 ID

### 步骤3：创建任务工作区

执行 workspace 脚本创建任务目录：

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-workspace.js create-feature-task ${CLAUDE_PROJECT_DIR} <task-id> auto-design
```

`${CLAUDE_PROJECT_DIR}` 为项目根目录，脚本会在该目录下创建 `.devsphere/tasks/feature/<task-id>/` 及所有子目录，并初始化只保存顶层工作流事实的 `state.json`（`status=initialized`、`workflowMode=auto-design`）。设计阶段完成度由正式 Baseline Artifact 判断，不在 state 中创建阶段游标。

**保存输出结果中的 `taskPath`**（JSON 中的 `taskPath` 字段），下一步需要用到。

### 步骤4：创建初始文件

- 将用户需求描述写入 `inputs/requirement.md`（仅原始需求；澄清区块由 `feature-clarify` 后续追加。**不得**把用户需求作为 shell 参数拼接或插值，从而避免空格、引号或 shell 特殊字符改变输入）
- 初始化 `evidence/evidence-registry.json` 为 `{"evidences": []}`。专项 Review 摘要在实际评审时按阶段创建，不初始化共享矩阵。

### 步骤5：确认创建

展示：
```
✅ 任务已创建: {taskId}

**工作区:** .devsphere/tasks/feature/{taskId}/
**状态:** initialized
**工作流模式:** auto-design（可在评估阶段更改）

**下一步:** /scc-dev-sphere:workflow
  → 将先引导你完成需求澄清，再进行复杂度评估。
```

### 步骤6：提示下一步

「使用 `/scc-dev-sphere:workflow` 进入 `feature-clarify` 需求澄清。」
