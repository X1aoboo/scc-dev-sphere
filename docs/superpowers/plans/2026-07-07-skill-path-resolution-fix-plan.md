# Skill 脚本路径解析修复 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 3 个 skill 文件中 workspace root 路径歧义，将 `.` 替换为 `${CLAUDE_PROJECT_DIR}`，将 `<插件根目录>` 替换为 `${CLAUDE_SKILL_DIR}/../..`。

**Architecture:** 仅修改 3 个 SKILL.md 文件中的脚本调用和相关描述文字。不改动任何 JS 脚本或 hooks 配置。改动模式统一：每个文件中的 `<插件根目录>` → `${CLAUDE_SKILL_DIR}/../..`，`.` → `${CLAUDE_PROJECT_DIR}`。

**Tech Stack:** Markdown 文件修改，`git diff` + `grep` 验证。

## Global Constraints

- JS 脚本文件（`scripts/` 目录）不做任何修改
- `hooks/hooks.json` 不做任何修改
- `${CLAUDE_SKILL_DIR}` 和 `${CLAUDE_PROJECT_DIR}` 是 Claude Code 内置变量，运行时自动替换，不需要手动赋值
- 每个 skill 文件的改动独立，commit 可分开

---

## 文件结构

```
skills/workflow/SKILL.md     (修改) — 步骤4 脚本调用 + 描述文字
skills/feature-init/SKILL.md (修改) — 步骤3 脚本调用 + 描述文字，步骤4 脚本调用
skills/status/SKILL.md       (修改) — 步骤4 脚本调用
```

---

### Task 1: 修复 `skills/workflow/SKILL.md`

**Files:**
- Modify: `skills/workflow/SKILL.md:60-72`

**Interfaces:**
- Consumes: 无
- Produces: 修复后的步骤4 脚本调用和描述文字

- [ ] **Step 1: 替换步骤4 描述文字和脚本调用**

**old_string:**
```
### 步骤4：计算 nextAction 并判定任务状态

运行确定性 workflow resolver。从会话上下文中的 **Base directory** 信息推算出插件根目录（本 skill 位于 `skills/workflow/`，向上两级即为插件根目录），拼接出脚本绝对路径后执行：

```bash
node <插件根目录>/scripts/devsphere-workflow.js .
```

resolver 会：
1. 在 CWD 中查找 `.devsphere/current-task.json`
2. 如找到，读取 `current-task.json` 识别 `activeTaskId` 和 `taskType`
3. 加载对应的 resolver（MVP：`scripts/workflows/feature-workflow.js`）
4. 输出 `nextAction` JSON 到 stdout

解析 stdout 中的 JSON 输出到 `nextAction`。
```

**new_string:**
```
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
```

使用 Edit 工具执行替换。

- [ ] **Step 2: 验证改动**

```bash
grep -n 'CLAUDE_PROJECT_DIR\|CLAUDE_SKILL_DIR' skills/workflow/SKILL.md
```

预期输出：步骤4 的 bash 命令中包含 `${CLAUDE_SKILL_DIR}` 和 `${CLAUDE_PROJECT_DIR}`。

- [ ] **Step 3: 确认无残留的 `.` 作为 workspace root**

```bash
grep 'devsphere-workflow.js \.' skills/workflow/SKILL.md || echo "PASS: 已移除 ."
```

预期输出：`PASS: 已移除 .`

- [ ] **Step 4: 确认无残留的 `<插件根目录>`**

```bash
grep '<插件根目录>' skills/workflow/SKILL.md || echo "PASS: 已移除 <插件根目录>"
```

预期输出：`PASS: 已移除 <插件根目录>`

- [ ] **Step 5: Commit**

```bash
git add skills/workflow/SKILL.md
git commit -m "fix: workflow skill 使用内置变量替代 . 和插件根目录推算"
```

---

### Task 2: 修复 `skills/feature-init/SKILL.md`

**Files:**
- Modify: `skills/feature-init/SKILL.md:39-47`
- Modify: `skills/feature-init/SKILL.md:53-57`

**Interfaces:**
- Consumes: 无
- Produces: 修复后的步骤3 和步骤4 脚本调用和描述文字

- [ ] **Step 1: 替换步骤3 脚本调用和描述文字**

**old_string:**
```
### 步骤3：创建任务工作区

从会话上下文中的 **Base directory** 信息推算出插件根目录（本 skill 位于 `skills/feature-init/`，向上两级即为插件根目录），拼接出脚本绝对路径后执行：

```bash
node <插件根目录>/scripts/devsphere-workspace.js create-feature-task . <task-id> auto-design
```

`create-feature-task` 的第一个参数是工作空间根目录，`.` 即当前工作目录（你启动 claude 时的 CWD）。脚本会在该目录下创建 `.devsphere/tasks/feature/<task-id>/` 及所有子目录，并初始化 `state.json`（`status=initialized`、`workflowMode=auto-design`）。
```

**new_string:**
```
### 步骤3：创建任务工作区

执行 workspace 脚本创建任务目录：

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-workspace.js create-feature-task ${CLAUDE_PROJECT_DIR} <task-id> auto-design
```

`${CLAUDE_PROJECT_DIR}` 为项目根目录，脚本会在该目录下创建 `.devsphere/tasks/feature/<task-id>/` 及所有子目录，并初始化 `state.json`（`status=initialized`、`workflowMode=auto-design`）。
```

使用 Edit 工具执行替换。

- [ ] **Step 2: 替换步骤4 脚本调用**

**old_string:**
```
- 初始化评审矩阵（`devsphere-review-matrix.js` 与上一步脚本在同一 `scripts/` 目录下）：
  ```bash
  node <插件根目录>/scripts/devsphere-review-matrix.js init "<taskPath>"
  ```
```

**new_string:**
```
- 初始化评审矩阵：
  ```bash
  node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-review-matrix.js init "<taskPath>"
  ```
```

使用 Edit 工具执行替换。

- [ ] **Step 3: 验证改动**

```bash
grep -n 'CLAUDE_PROJECT_DIR\|CLAUDE_SKILL_DIR' skills/feature-init/SKILL.md
```

预期输出：步骤3 bash 命令和步骤4 bash 命令中各含对应变量。

- [ ] **Step 4: 确认无残留**

```bash
grep 'create-feature-task \.' skills/feature-init/SKILL.md || echo "PASS: 已移除 ."
grep '<插件根目录>' skills/feature-init/SKILL.md || echo "PASS: 已移除 <插件根目录>"
```

预期输出：两个 `PASS`。

- [ ] **Step 5: Commit**

```bash
git add skills/feature-init/SKILL.md
git commit -m "fix: feature-init skill 使用内置变量替代 . 和插件根目录推算"
```

---

### Task 3: 修复 `skills/status/SKILL.md`

**Files:**
- Modify: `skills/status/SKILL.md:31-33`

**Interfaces:**
- Consumes: 无
- Produces: 修复后的步骤4 脚本调用

- [ ] **Step 1: 替换步骤4 脚本调用**

**old_string:**
```
运行 `node <插件根目录>/scripts/devsphere-workflow.js .` 获取下一步建议。仅用于展示 —— 不执行任何动作。
```

**new_string:**
```
运行 `node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-workflow.js ${CLAUDE_PROJECT_DIR}` 获取下一步建议。仅用于展示 —— 不执行任何动作。
```

使用 Edit 工具执行替换。

- [ ] **Step 2: 验证改动**

```bash
grep -n 'CLAUDE_PROJECT_DIR\|CLAUDE_SKILL_DIR' skills/status/SKILL.md
```

- [ ] **Step 3: 确认无残留**

```bash
grep 'devsphere-workflow.js \.' skills/status/SKILL.md || echo "PASS: 已移除 ."
grep '<插件根目录>' skills/status/SKILL.md || echo "PASS: 已移除 <插件根目录>"
```

预期输出：两个 `PASS`。

- [ ] **Step 4: Commit**

```bash
git add skills/status/SKILL.md
git commit -m "fix: status skill 使用内置变量替代 . 和插件根目录推算"
```

---

### Task 4: 最终验证

**Files:**
- 无（只读验证）

**Interfaces:**
- Consumes: Task 1-3 的改动
- Produces: 验证报告

- [ ] **Step 1: 全项目扫描，确认所有 skill 文件不再有 `.` 作为 workspace root**

```bash
grep -rn 'devsphere-workflow.js \.\|devsphere-workspace.js create-feature-task \.' skills/ || echo "PASS: 全部修复"
```

预期输出：`PASS: 全部修复`

- [ ] **Step 2: 确认所有 skill 文件不再有 `<插件根目录>` 模式**

```bash
grep -rn '<插件根目录>' skills/ || echo "PASS: 全部移除"
```

预期输出：`PASS: 全部移除`

- [ ] **Step 3: 确认 hooks.json 未被改动**

```bash
git diff --name-only HEAD~3..HEAD | grep hooks.json && echo "WARNING: hooks.json was modified" || echo "PASS: hooks.json 未改动"
```

预期输出：`PASS: hooks.json 未改动`

- [ ] **Step 4: 确认 JS 脚本未被改动**

```bash
git diff --name-only HEAD~3..HEAD | grep '^scripts/' && echo "WARNING: scripts were modified" || echo "PASS: scripts 未改动"
```

预期输出：`PASS: scripts 未改动`

- [ ] **Step 5: 查看最终 diff**

```bash
git diff HEAD~3..HEAD --stat
```

预期输出：仅 3 个 `skills/*/SKILL.md` 文件被修改。
