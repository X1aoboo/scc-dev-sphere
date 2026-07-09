---
name: feature-design
description: 设计阶段循环执行器。在主会话运行，调 resolve-design-loop 确定性路由，按动作类型派发 teammate / 代问用户 / 派评审，直到设计阶段完成。依赖 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1。
---

# Feature Design — 设计循环执行器

你在主会话运行（agents=[]），驱动设计阶段决策循环。**路由完全由确定性脚本决定**，你只负责「执行脚本返回的动作」。

## 集成契约

- **入口:** 被 workflow skill 在任务处于 `designing` 状态时调用。
- **依赖:** `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`（用 agent-teams 派发 teammate）。未启用则降级提示用户启用。
- **入参:** 当前活跃任务（`.devsphere/current-task.json`）。
- **输出:** 设计阶段全部就绪（`all_design_stages_ready`）→ 返回 workflow 进入 integrated-design；或 `human_confirm` 暂停等用户。
- **完成标准:** `resolve-design-loop` 返回 `all_design_stages_ready`。

## 执行循环

重复步骤 1–3，直到动作不需再循环：

### 步骤1：运行确定性路由

先解析当前任务的绝对 taskPath（记为 `$TP`）——读 `.devsphere/current-task.json` 的 `taskPath` 字段并拼上 `${CLAUDE_PROJECT_DIR}`，或：

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-state.js get-task-path ${CLAUDE_PROJECT_DIR}
# 输出 {"taskPath":"<abs path>"}，取 taskPath 作为 $TP
```

然后运行路由：

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js resolve-design-loop "$TP"
```

解析 stdout JSON 为 `action`。

### 步骤2：按 `action.kind` 派发

| kind | 动作 |
|---|---|
| `dispatch_agent` (mode=`scope`) | **轮1（出土决策）。** 用 Agent tool 派发 `action.agent` 为 teammate（后台），prompt 指明：跑 `action.skill` 的 **scope 模式**、stage=`action.stage`、**humanGated**=`action.humanGated`、只写 decisions 不碰主产物、**完成后发完成消息给 lead**。派发后**从 Agent 返回结果捕获 `agentId`**，按 stage 记入主会话上下文（如 `agentId[businessDesign]=<id>`）。**然后等待 teammate 自动推送的完成消息**——禁止轮询、禁止派第二个 Agent 去查、禁止派"check"agent（teammate 完成时消息自动送达 lead）。收到完成消息后到步骤3。 |
| `dispatch_agent` (mode=`draft`) | **轮2（基于决议定稿），须恢复轮1 的同一 teammate 实例（保活上下文）。** 先查主会话是否持有该 stage 的 `agentId`。**持有** → 用 `SendMessage` 恢复：`to=<agentId>`、`message`=决议内容+draft 指令、**`summary`=<短摘要>（必填，否则报错）**。**绝不重新 Agent 派发**——恢复同一实例以保留轮1 分析上下文。**未持有**（如 `/resume` 后 in-process teammate 未恢复）→ 降级：重新 Agent 派发 draft（fresh 上下文），并在输出提示「teammate 未保活，draft 以 fresh 上下文重跑」。draft 完成后等 teammate 完成消息。**若 `action.requiresReReview===true`：draft 完成后不要直接回步骤1**——先执行一次 `dispatch_reviewers`（见下行），待 review-matrix 更新后再回步骤1。否则到步骤3。 |
| `ask_decisions` | 对 `action.decisions[]` **逐项**按 `decision_loop` 模式（见 `references/interaction-guidelines.md`）调 AskUserQuestion，回写 `resolution`（`devsphere-decisions.js resolve`）。全部 resolved 后到步骤3。 |
| `dispatch_reviewers` | 用 Agent tool **并行**派发 `action.reviewers` 跑 `feature-review`。完成后到步骤3。 |
| `human_confirm` | 用 AskUserQuestion（confirm_gate）请用户批准该阶段。**批准后先运行** `set-stage-status <taskPath> <action.stage> human_approved`（写入 human_approved），再到步骤3。 |
| `all_design_stages_ready` | 设计阶段全部完成，**返回 workflow**（进入 integrated-design / `design_ready`）。 |
| `show_status` | 展示 `action.reason`，停止并提示用户。 |

### 步骤3：阶段状态同步后回步骤1

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js sync-stage-status ${CLAUDE_PROJECT_DIR}
```

然后回步骤1（resolver 将基于更新后的磁盘事实重算）。

## 约束

- **不自行决定路由**——一切以 `resolve-design-loop` 返回为准。
- **不在主会话写设计产物**——产物由 teammate 写；主会话只写 `resolution`（代问用户后）。
- **revise（`requiresReReview`）后必须先 re-review 再回 resolver**——否则 blocking 仍 open 会死循环。
- **【teammate 保活】同一 stage 的 draft 必须用 scope 轮捕获的 `agentId` 经 `SendMessage` 恢复，不得重新 Agent 派发**（保活上下文 + 防重复实例）。
- **【禁轮询/禁重复派发】scope 派发后只等 teammate 自动推送的完成消息，不得派任何"检查/查询/催促"agent**——teammate 完成时消息自动送达 lead，无需轮询。`SendMessage` 的 `message` 为字符串时**必须带 `summary` 字段**。
- teammate 持久上下文跨 scope/draft 两轮（agent-teams）；不原地阻塞等用户。
