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

### 步骤1：收集输入

直接在对话中以自然语言向用户提问，**不要使用 AskUserQuestion 工具**（该工具仅支持选择题，不支持开放式输入）。

需要收集的信息：
1. 需求的简要描述（1-3 句话）
2. 可选，指定任务 ID（不指定则自动生成 `FEAT-YYYYMMDD-NNN`）

将需求描述保存到 `inputs/requirement.md`。

### 步骤2：创建任务工作区

运行以下命令创建任务工作区（注意 `scripts/devsphere-workspace.js` 是插件内部的脚本，使用 `.` 表示当前工作目录）：
```bash
node scripts/devsphere-workspace.js create-feature-task "." "<task-id>" auto-design
```

这会创建 `.devsphere/tasks/feature/<task-id>/` 目录及所有子目录，并初始化 `state.json`（`status=initialized`、`workflowMode=auto-design`）。

**保存输出结果中的 `taskPath`**，下一步需要用到。

### 步骤3：创建初始文件

- 将用户需求描述写入 `inputs/requirement.md`
- 初始化评审矩阵（使用上一步返回的 `taskPath`）：
  ```bash
  node scripts/devsphere-review-matrix.js init "<taskPath>"
  ```
- 初始化 `evidence/evidence-registry.json` 为 `{"evidence": []}`

### 步骤4：确认创建

展示：
```
✅ 任务已创建: {taskId}

**工作区:** .devsphere/tasks/feature/{taskId}/
**状态:** initialized
**工作流模式:** auto-design（可在评估阶段更改）

**下一步:** /scc-dev-sphere:workflow
  → 将引导你进行复杂度评估。
```

### 步骤5：提示下一步

「使用 `/scc-dev-sphere:workflow` 进入复杂度与风险评估。」
