---
name: feature-design
description: 设计阶段薄执行器。在主会话(team lead)运行:事件驱动地咨询 feature-design-router 拿下一步动作,用原生 teammate 原语执行。不持 agentId、不造控制流。依赖 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1。
---

# Feature Design — 设计阶段薄执行器

你在主会话(team lead)运行(agents=[])。**你不自行判断阶段流转或动作选择** —— 一律由确定性 router 决定。你只负责:咨询 router → 用原生 teammate 原语执行返回的动作。

## 入口(固定行,无分支)

进入设计阶段第一步,写状态:
```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js set-task-status ${CLAUDE_PROJECT_DIR} designing
```

## 咨询循环(事件驱动)

**何时咨询**:入口后;以及每次 teammate 回报(idle 通知 / 消息:draft 成、N 项 gated 待代问、评审完成、blocking=N)后。**等待 teammate 期间不咨询**(依赖 agent-teams 的消息自动送达 + idle 自动通知)。

每次咨询:
1. `node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js sync-stage-status ${CLAUDE_PROJECT_DIR}`
2. `node ${CLAUDE_SKILL_DIR}/../../scripts/feature-design-router.js ${CLAUDE_PROJECT_DIR}` → stdout 是一个 designAction JSON。
3. 按 `action.kind` 执行(见下)。执行后要么等 teammate 回报(自然再咨询),要么立即回到步骤 1 重咨询。

## 按 kind 执行

### `produce_draft`
- `payload.mode === 'initial'`:
  1. `node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-decisions.js init <taskPath> <slug> <taskId> <stage>`(初始化该阶段 decisions 文件;<taskPath>/<slug>/<taskId>/<stage> 从 action 与 current-task 取)。
  2. 执行 `action.dispatchCmd`,把 **stdout 原样**作为 Agent prompt,**后台 spawn** 一个名为 `action.name`(形如 `sa-businessDesign`)的 teammate。
- `payload.mode === 'continue'` 或 `'revise'`:
  - **按名字 message** 名为 `action.name` 的 teammate(agent-teams 原语:存在则唤醒续线程;不存在则按 initial 的 dispatchCmd 重新 spawn)。message 内容:continue 时附 `payload.resolutions`;revise 时附 `payload.blockingItems`。**message 为字符串时必带 summary**。
- 执行后**等 teammate 回报**,不重咨询。

### `ask_gated`
- 对 `action.decisions` **逐项** AskUserQuestion(遵循 `references/interaction-guidelines.md` 的 decision_loop,按各 decision 的 `askMode` 选 single_select/multi_select/confirm_gate,`options`/`recommendation` 直接取自 decision)。
- 每项用户决策后回写:
  ```bash
  node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-decisions.js resolve <taskPath> <slug> <decision.id> '<resolution json>'
  ```
  `<resolution json>` 形如 `{"chosen":"<选项 label>","note":"<可选>"}`。
- 全部 resolve 后**立即重咨询**(步骤 1)。

### `dispatch_reviews`
- 对 `action.reviewers` **并行**后台 spawn:每个执行其 `dispatchCmd`,stdout 原样作为 Agent prompt,teammate 名为其 `name`(形如 `se-review-businessDesign`)。
- 评审是 one-shot,不持 agentId。执行后**等所有评审回报**,不重咨询。

### `human_approve`
- AskUserQuestion(confirm_gate 模式)请用户批准 `action.stage` 的设计。
- **批准**:`node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js set-stage-status <taskPath> <stage> human_approved` → 重咨询。
- **驳回**:把用户反馈作为 blocking issue 注入 matrix(经 `devsphere-review-matrix.js add <taskPath> <slug> '{"type":"blocking","reviewerAgent":"human","round":N}'`)→ 重咨询(router 将转 revise)。

### `design_phase_complete`
- 跑 integrated-design(既有逻辑:组装四阶段产物 → 交叉评审 → 通过)。
- 完成后:`node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js set-task-status ${CLAUDE_PROJECT_DIR} design_ready`。
- 结束(下次 `/workflow` 会路由到 feature-approve)。

### `design_blocked`
- 展示 `action.reason`,停止。等人工介入。

### 未识别的 kind(如 `show_status` / `blocked`)
- 展示 `action.reason`,停止,报告异常(通常意味着无 active task 或 state 文件缺失)。

## 约束

- **不自行写派发词** —— 派发 prompt 一律执行 `action.dispatchCmd` 的 stdout。
- **不直接写设计产物 / decisions** —— 产物由 teammate 写;decisions 只经 CLI;status 只经 feature-workflow.js 写命令。
- **不持 agentId / 不维护 teammate 注册表** —— 寻址用 action 里的确定性名字,存在性/wake 归 harness。
- **不判断阶段流转** —— 选哪个阶段、做什么动作,全由 router 决定;你只执行。
