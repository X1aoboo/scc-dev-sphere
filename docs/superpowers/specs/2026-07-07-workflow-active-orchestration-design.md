# Workflow 主动编排改造 — 设计文档

**日期:** 2026-07-07
**状态:** approved

## 1. 目标

将 workflow 从「被动推荐者」改造为「主动编排者」：展示状态后用 AskUserQuestion 获取用户确认，自动调用 Agent 执行。同时 feature-design 成为设计阶段的唯一编排入口，按工作流模式在阶段间自动推进或暂停。

## 2. 当前问题

- workflow 只展示建议的 skill 名，用户需手动输入命令
- feature-design 每次只推进一个阶段，多阶段需反复调用
- 交互松散，用户手工操作过多

## 3. 目标架构

```
workflow → 展示状态 → AskUserQuestion「继续？」→ Agent(名, skill, 参数)
  → feature-design → 读 state → 路由阶段 → 加载 Agent 执行
    → 阶段完成 → 按 workflowMode 决定自动继续/暂停
    → 循环直到所有阶段完成或用户暂停
```

## 4. workflow 改造

### 4.1 run_skill 分支

**展示状态后，使用 AskUserQuestion 获取决策：**
- `header`: "下一步"
- `question`: 展示 nextAction.reason 和关键状态信息
- `options`:
  - `"✅ 继续推进"` — 自动加载 Agent，传入 skill 名和参数
  - `"⏸️ 暂停"` — 不执行
- `multiSelect`: false
- 用户可通过 Other 输入自定义指令

**确认后：** 使用 Agent tool 调用 nextAction.agents 中推荐的 Agent，将 skill 名和参数传入。

**删除约束：** 「Workflow 不直接执行 agent/skill 动作 —— 只提供建议」

### 4.2 Resolver 输出调整

设计阶段的 resolver 输出中，`skill` 字段统一为 `feature-design`（而非具体阶段 skill 如 `feature-design-business`）。

### 4.3 其他分支不变

`human_confirm`、`show_status`、`blocked`、`completed` 分支保持现有逻辑。

## 5. feature-design 改造

### 5.1 核心执行流程

```
1. 读 state.json → 获取 workflowMode、stages 状态
2. 循环：
   a. 找下一个未完成阶段（business → solution → implementation → test）
   b. 所有阶段完成 → 跳到步骤4
   c. 加载对应 Agent，执行阶段 skill
   d. 更新阶段 state（由阶段 skill 负责）
   e. 检查是否暂停：
      - auto-design: 自动继续（不回用户，直接下一步）
      - collaborative-design: 下一阶段在 humanGateStages 中？AskUserQuestion；否则自动继续
      - strict-human-loop: AskUserQuestion「继续下一阶段？」
3. 循环结束条件：所有阶段完成 或 用户选择暂停
4. 生成/刷新 integrated-design.md
5. 展示摘要，建议 /scc-dev-sphere:workflow 进入评审
```

### 5.2 AskUserQuestion 触发规则

| 工作流模式 | 何时 AskUserQuestion |
|-----------|---------------------|
| auto-design | 不触发，全自动推进 |
| collaborative-design | 仅在 humanGateStages 中指定的阶段完成后暂停 |
| strict-human-loop | 每个阶段完成后都暂停 |

**AskUserQuestion 参数：**
- `header`: "阶段完成"（≤12字）
- `question`: "当前阶段 {阶段名} 已完成。是否继续下一阶段 {下一阶段名}？"
- `options`:
  - `"✅ 继续下一阶段"` — 自动推进
  - `"⏸️ 暂停"` — 停止编排，返回用户
- `multiSelect`: false

### 5.3 规则变更

| 旧规则 | 新规则 |
|--------|--------|
| 每次调用只推进一个阶段 | 按工作流模式自动推进多个阶段，必要时暂停 |
| 完成后建议用 workflow 检查 | 完成后建议用 workflow 进入评审 |

**保留规则：** 不覆盖已 `human_approved` 的阶段（除非 `--mode revise`）。

## 6. 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `skills/workflow/SKILL.md` | 修改 | run_skill 分支改为 AskUserQuestion + 自动派发 Agent |
| `skills/feature-design/SKILL.md` | 修改 | 单阶段推进 → 循环编排 + 按模式暂停 |
| `scripts/workflows/feature-workflow.js` | 修改 | 设计阶段 skill 输出统一为 `feature-design` |

## 7. 不受影响

- 其他 workflow 分支（human_confirm, show_status, blocked, completed）
- 各阶段设计 skill（business/solution/implementation/test）—— 只被 feature-design 调用，逻辑不变
- feature-assess、feature-review、feature-approve、feature-implement、feature-verify
