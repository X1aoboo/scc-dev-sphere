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

直接在对话中以自然语言向用户提问。此场景为开放式输入（需求描述），不适合使用选项卡式交互。

需要收集的信息：
1. 需求的简要描述（1-3 句话）
2. 可选，指定任务 ID（不指定则自动生成 `FEAT-YYYYMMDD-NNN`）

将需求描述保存到 `inputs/requirement.md`。

### 步骤2：创建任务工作区

从会话上下文中的 **Base directory** 信息推算出插件根目录（本 skill 位于 `skills/feature-init/`，向上两级即为插件根目录），拼接出脚本绝对路径后执行：

```bash
node <插件根目录>/scripts/devsphere-workspace.js create-feature-task . <task-id> auto-design
```

`create-feature-task` 的第一个参数是工作空间根目录，`.` 即当前工作目录（你启动 claude 时的 CWD）。脚本会在该目录下创建 `.devsphere/tasks/feature/<task-id>/` 及所有子目录，并初始化 `state.json`（`status=initialized`、`workflowMode=auto-design`）。

**保存输出结果中的 `taskPath`**（JSON 中的 `taskPath` 字段），下一步需要用到。

### 步骤3：创建初始文件

- 将用户需求描述写入 `inputs/requirement.md`
- 初始化评审矩阵（`devsphere-review-matrix.js` 与上一步脚本在同一 `scripts/` 目录下）：
  ```bash
  node <插件根目录>/scripts/devsphere-review-matrix.js init "<taskPath>"
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
