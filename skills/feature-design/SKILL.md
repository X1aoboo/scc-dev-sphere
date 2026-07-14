---
name: feature-design
description: 设计阶段薄执行器。在主会话(team lead)运行:事件驱动地咨询 feature-design-router 拿下一步动作,用原生 teammate 原语执行。不持 agentId、不造控制流。依赖 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1。
---

# Feature Design — 设计阶段薄执行器

你在主会话(team lead)运行(agents=[])。**你不自行判断阶段流转或动作选择** —— 一律由确定性 router 决定。你只负责:咨询 router → 用原生 teammate 原语执行返回的动作。

## 入口(固定行,无分支)

进入设计阶段时，Lead 先确认 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`。未启用时直接阻断，不退回串行派发。

随后在当前 Claude Code 会话内创建设计团队（如果对应逻辑 teammate 已存在则复用）：

```text
design-sa
design-se
design-mde
design-tse
design-dev
```

当 `ciCdRisk=true` 时再创建 `design-cie`。使用：

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-dispatch.js build bootstrap <role> designTeam ${CLAUDE_PROJECT_DIR} scc-dev-sphere:devsphere-teammate-conduct
```

将 stdout 原样作为 bootstrap prompt，按固定逻辑名称创建 teammate。不得持久化 Agent ID；新会话重新 bootstrap 缺失成员。

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
  2. 执行 `action.dispatchCmd`,把 **stdout 原样**作为 Agent prompt,**后台 spawn** 一个名为 `action.name`(形如 `design-sa`)的 teammate。
- `payload.mode === 'continue'` 或 `'revise'`:
  - **按名字 message** 名为 `action.name` 的稳定 teammate（存在则唤醒；不存在则用 initial 的 dispatchCmd 重新 spawn）。message 内容：continue 时附 `payload.resolutions`；revise 时附统一的 `payload.reviewItems`（可同时包含 blocking/advisory/risk_candidate）。
  - `payload.requiresReReview` 仅表示修订后必须对新 artifact version 重新评审；实际 Reviewer 派发仍由 Lead/router 完成。
  - 设计 Agent 修订完成后只通知 Lead 并递增 artifact version，不派发 Reviewer、不推进 artifact/stage 状态。Lead 重新咨询 router，由 Lead 统一派发当前版本评审。
- 执行后**等 teammate 回报**，再回到咨询循环。

### `ask_gated`
- 对 `action.decisions` **逐项** AskUserQuestion(遵循 `references/interaction-guidelines.md` 的 decision_loop,按各 decision 的 `askMode` 选 single_select/multi_select/confirm_gate,`options`/`recommendation` 直接取自 decision)。
- 每项用户决策后回写:
  ```bash
  node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-decisions.js resolve <taskPath> <slug> <decision.id> '<resolution json>'
  ```
  `<resolution json>` 形如 `{"chosen":"<选项 label>","note":"<可选>"}`。
- 全部 resolve 后**立即重咨询**(步骤 1)。

### `ask_review`
- 这是 Lead 代 feature-review teammate 向用户询问 review issue 的动作；review teammate 不调用 `AskUserQuestion`。
- 对 `action.issues` 中每个 pending advisory/risk 逐项调用 `AskUserQuestion`：
  - advisory：`apply` / `no_change`；
  - risk_candidate：`apply` / `accepted_risk` / `mitigated` / `rejected`。
- 用户选择后，Lead 仅更新原 issue 的 `humanDecision`，不新增 issue、不转换为 blocking：
  ```bash
  node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-review-matrix.js close <taskPath> <issueId> --decision <decision> --closure "用户确认 <decision>"
  ```
- 全部 pending issue 决策完成后立即重咨询；router 会把 open blocking 与 `humanDecision=apply` 的 advisory/risk 合并到同一个 revise action。

### `dispatch_reviews`
- Lead 先执行 `action.authorizeCmd`，为当前 `artifactVersion` 初始化各角色评审快照。
- 对 `action.reviewers` **并行**向已有的稳定 teammate（如 `design-se`）发送 `promptCmd` stdout；不新建 `se-review-businessDesign` 这类临时 Reviewer。
- Lead 不转发评审内容，只等待各 Reviewer 向 Lead 通知完成。未全部完成前不得 revise。

### `wait_reviews`
- 当前版本已有授权或进行中的 Reviewer，保持等待。
- 不重复派发，不修改 matrix，不推进 artifact/stage。
- 收到 Reviewer 完成或异常退出消息后重新咨询 router；需要恢复时按稳定 teammate 名称唤醒或重建。

### `merge_reviews`
- Lead 执行 `action.mergeCmd`，由脚本读取当前版本全部角色快照，并一次性合并到 `review-matrix.json`。
- 合并内容包括新 issue 和原 issue 的复评关闭结论；Reviewer 的判断是事实，Lead 不重新评审。
- 脚本仅在所有 reviewer 快照完成后执行，且使用原子写入和幂等 source 防止重复合并。
- 合并后重新咨询 router：存在 pending advisory/risk 进入 `ask_review`；存在 blocking 或 apply issue 进入统一 revise；全部门禁满足时由脚本设置 `reviewed`。

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

- **不自行写派发词** —— 派发 prompt 一律执行 action 中的 prompt/dispatch command stdout。
- **不直接写设计产物 / decisions / review matrix** —— 产物由 teammate 写；decisions 只经 CLI；评审快照只经 `devsphere-review-state.js`；status 只经 Lead 门禁命令写入。
- **不持 agentId / 不维护 teammate 注册表** —— 寻址用确定性逻辑名称，存在性/wake 归 Claude Code team harness。
- **不判断阶段流转** —— 选哪个阶段、做什么动作,全由 router 决定;你只执行。
