# workflow 活跃任务判定改造 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除 workflow 步骤4的路径歧义，将「AI 手动查文件」改为「统一跑 resolver 判定」。

**Architecture:** 仅修改 `skills/workflow/SKILL.md` 一个文件。删除步骤4的 .devsphere 手动检查，将步骤4/5合并为新的步骤4（跑 resolver → 判断有无任务），后续步骤编号重排。

**Tech Stack:** Markdown 文件修改。

## Global Constraints

- resolver 脚本（`devsphere-workflow.js`）不做任何修改
- 当 resolver 返回 `kind: 'show_status'` 且 `reason` 包含 `'No active task'` 时，展示「创建 feature 任务」引导并终止
- 除此以外的 `show_status` 返回，正常展示状态信息
- 步骤编号保持连续，不跳号

---

## 文件结构

```
skills/workflow/SKILL.md  (修改) — 删除步骤4，合并步骤4/5判定，调整编号
```

---

### Task 1: 删除步骤4 + 合并步骤5判定 + 重编号

**Files:**
- Modify: `skills/workflow/SKILL.md:60-93`

**Interfaces:**
- Consumes: resolver 的 stdout JSON 输出，表示活跃任务状态
- Produces: 精简后的 workflow 执行流程（4步 → 步骤4 直接跑 resolver）

- [ ] **Step 1: 读取当前文件确认内容**

```bash
head -100 skills/workflow/SKILL.md
```

- [ ] **Step 2: 删除步骤4（无活跃任务时）**

将第 60-71 行：
```
### 步骤4：无活跃任务时

如果 `.devsphere/current-task.json` 不存在或缺少 `activeTaskId`，显示：

```
未找到活跃任务。创建 feature 任务请使用：
  /scc-dev-sphere:feature-init

列出已有任务：/scc-dev-sphere:workflow list
切换任务：    /scc-dev-sphere:workflow switch <task-id>
```
终止。
```

删除。

- [ ] **Step 3: 合并步骤5为新的步骤4 + 添加任务判定**

将原来的步骤5（计算 nextAction）内容替换为新的步骤4（计算 nextAction + 判定活跃任务）：

**原来：**
```
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
```

**替换为：**
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
```

使用 Edit 工具：

```
old_string: "### 步骤5：计算 nextAction\n\n运行确定性 workflow resolver。"
new_string: "### 步骤4：计算 nextAction 并判定任务状态\n\n运行确定性 workflow resolver。"
```

- [ ] **Step 4: 重编号后续步骤**

原步骤6 → 步骤5，原步骤7 → 步骤6。

```bash
sed -i '' 's/### 步骤6：向用户展示 nextAction/### 步骤5：向用户展示 nextAction/' skills/workflow/SKILL.md
sed -i '' 's/### 步骤7：用户执行后/### 步骤6：用户执行后/' skills/workflow/SKILL.md
```

- [ ] **Step 5: 验证修改**

确认步骤结构正确：

```bash
grep "^### 步骤" skills/workflow/SKILL.md
```

预期输出：
```
### 步骤1：解析参数
### 步骤2：处理 `list` 子动作
### 步骤3：处理 `switch` 子动作
### 步骤4：计算 nextAction 并判定任务状态
### 步骤5：向用户展示 nextAction
### 步骤6：用户执行后
```

确认无步骤4（无活跃任务时）残留：
```bash
grep "步骤4：无活跃任务时" skills/workflow/SKILL.md || echo "PASS: 已删除"
```

确认不再有 AI 手动查文件的指令：
```bash
grep "如果 \`.devsphere/current-task.json\` 不存在" skills/workflow/SKILL.md || echo "PASS: 已移除"
```

- [ ] **Step 6: 提交**

```bash
git add skills/workflow/SKILL.md
git commit -m "feat: workflow 活跃任务判定改为统一跑 resolver，消除路径歧义"
```
