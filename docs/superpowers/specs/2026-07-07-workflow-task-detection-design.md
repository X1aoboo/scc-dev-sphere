# workflow 活跃任务判定改造 — 设计文档

**日期:** 2026-07-07
**状态:** approved

## 1. 目标

消除 workflow 在判断「是否有活跃任务」时的路径歧义。当前步骤4 让 AI 自行检查 `.devsphere/current-task.json`，但 `.` 的指向模糊（AI 可能误判目录位置）。

## 2. 方案

将步骤4的「AI 手动查文件」改为「统一运行 resolver 脚本判定」。resolver 脚本的 `process.cwd()` 是确定的，其返回结果中的 `kind` 和 `reason` 字段可区分「无任务」和「有任务」两种状态。

## 3. 改动

### 3.1 删除步骤4（无活跃任务时）

当前步骤4（第 60-71 行）让 AI 检查 `.devsphere/current-task.json`，存在路径歧义。删除。

### 3.2 修改步骤5（计算 nextAction）

当前的步骤5 改名为新的步骤4，直接运行 resolver：

```bash
node <插件根目录>/scripts/devsphere-workflow.js .
```

解析 stdout 中的 JSON 输出到 `nextAction`。

### 3.3 新增 nextAction 判定

解析 `nextAction` 后，先判定是否有活跃任务：

- 如果 `nextAction.kind === 'show_status'` 且 `nextAction.reason` 包含 `'No active task'` → **无活跃任务**，展示引导提示并终止
- 否则 → **有活跃任务**，进入步骤5 的 kind 分支处理

### 3.4 后续步骤编号调整

- 当前步骤4 → 删除
- 当前步骤5 → 新的步骤4（计算 nextAction + 判定活跃任务）
- 当前步骤6 → 新的步骤5（展示 nextAction）
- 当前步骤7 → 新的步骤6（用户执行后）

## 4. 涉及文件

| 文件 | 改动 |
|------|------|
| `skills/workflow/SKILL.md` | 删除步骤4，合并步骤4/5判定逻辑，调整步骤编号 |

**不改动的文件：** resolver 脚本（已有 `show_status` + "No active task" 逻辑）、其他 skill。

## 5. 不受影响的行为

- `list`、`switch`、`human_confirm`、`blocked`、`completed` 分支不变
- resolver 的 `routeWorkflow()` 函数逻辑不变
- 插件根目录推算方式不变（从 skill 自身路径向上两级）
