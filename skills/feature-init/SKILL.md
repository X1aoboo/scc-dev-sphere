---
name: feature-init
description: 创建新的需求开发任务工作区。初始化 .devsphere 任务目录、state.json 和 current-task.json。新需求和存量功能调整统一作为 feature task 处理。
---

# Feature Init — 创建需求任务

在 `.devsphere/tasks/feature/<task-id>/` 下创建新的 feature 任务工作区。

## 集成契约

- **入口:** `/scc-dev-sphere:feature-init`
- **入参:** 任务 ID（可选，自动生成为 `FEAT-YYYYMMDD-NNN`）、需求描述（来自用户）
- **输出:** 任务工作区（含 `state.json`，status=initialized），`current-task.json` 已更新
- **完成标准:** `state.json` 存在且 status=initialized，目录结构已创建

## 执行步骤

### 步骤1：收集需求描述

直接在对话中以自然语言向用户提问。此场景为开放式输入，不适合使用选项卡式交互。

**每次只问一个问题。** 首先提问：

> 请用 1-3 句话简要描述你的需求（需要开发的功能或需要调整的存量功能）。

用户回复后，将需求描述暂时保存，进入步骤2。

### 步骤2：收集任务 ID（可选）

以自然语言向用户提问：

> 是否需要指定任务 ID？不指定则自动生成为 `FEAT-YYYYMMDD-NNN` 格式。

- 用户指定具体 ID → 使用该 ID
- 用户回复「不用」/「自动」/「不需要」/「不指定」等 → 自动生成
- 用户直接在步骤1的回复中同时给出了任务 ID → 跳过本步骤，使用用户指定的 ID

### 步骤3：创建任务工作区

执行 workspace 脚本创建任务目录：

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-workspace.js create-feature-task ${CLAUDE_PROJECT_DIR} <task-id> auto-design
```

`${CLAUDE_PROJECT_DIR}` 为项目根目录，脚本会在该目录下创建 `.devsphere/tasks/feature/<task-id>/` 及所有子目录，并初始化 `state.json`（`status=initialized`、`workflowMode=auto-design`）。

**保存输出结果中的 `taskPath`**（JSON 中的 `taskPath` 字段），下一步需要用到。

### 步骤4：创建初始文件

- 将用户需求描述写入 `inputs/requirement.md`（仅原始需求；澄清区块由 `feature-clarify` 后续追加。**不得**把用户需求作为 shell 参数拼接或插值，从而避免空格、引号或 shell 特殊字符改变输入）
- 初始化评审矩阵：
  ```bash
  node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-review-matrix.js init "<taskPath>"
  ```
- 初始化 `evidence/evidence-registry.json` 为 `{"evidence": []}`

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
