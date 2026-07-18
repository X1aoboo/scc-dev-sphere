---
name: feature-design
description: 设计阶段生命周期入口。在主会话(Design Lead)运行：按 current-stage 解析当前阶段，循环咨询 devsphere-design inspect 拿 nextAction，按动作执行（含多视角并行评审、integrated 组装），检查完成标准后重读。不依赖 Agent Teams，不管理长期 Agent。
---

# Feature Design — 设计阶段生命周期入口

你在主会话(Design Lead)运行。**你不自行判断阶段流转或动作选择** —— 一律由确定性 `current-stage` + `inspect` 决定。你只负责：解析当前阶段 → 读 inspect → 按 nextAction 执行 → 检查完成标准 → 重读。

## 入口

进入设计阶段第一步：
```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js set-task-status ${CLAUDE_PROJECT_DIR} designing
```

`<taskPath>` 从 `devsphere-state.js read-current-task` + `get-task-path` 取。

## 核心循环

每次循环：
1. 解析当前阶段：
   ```bash
   node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-design.js current-stage <taskPath>
   ```
   - 返回 `{complete:true}` → 设计全部完成，结束。
   - 返回 `{stage:<stage>}` → 对该 stage 调 `init-stage`（幂等），再 `inspect`：
     ```bash
     node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-design.js init-stage <taskPath> <stage>
     node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-design.js inspect <taskPath> <stage>
     ```
     `inspect` 的 stdout 是一个快照 JSON，关注 `nextAction`。
2. 按 `nextAction.kind` 执行（见下）。
3. 执行后**立即重读**（回到步骤 1）。

## 按 nextAction.kind 执行

### `run_stage`（activity = analyze | discover | design | revise | assemble）
- analyze/discover/design/revise：加载对应 Stage Skill（如 `scc-dev-sphere:feature-design-business`）按 activity 执行专业工作。
  - activity=analyze：完成 analysis.md 后，主会话判断达成完成条件 → `mark-ready <taskPath> <stage> analysis`。
  - activity=discover：完成 discovery.md、登记 evidence、记 decision/assumption 后 → `mark-ready <taskPath> <stage> discovery`。
  - activity=design：生成/更新 design.md 与 draft.md（draft 完整符合 Artifact 模板，带 frontmatter `artifactId=<slug>`、`version`）。
  - activity=revise：读取 inspect 返回的 revision 来源（gate fail / open review items），统一修订 design.md/draft.md；不跳过 Gate。
- activity=assemble（仅 integratedDesign）：主会话组装 `work/integrated-design/draft.md` —— 汇总四阶段 `artifacts/*.md` + 跨阶段追溯（REQ→ARCH→MOD→TEST）+ 关键 decision + 风险 + readiness。**不引入新设计事实**。组装完 draft 带 frontmatter（`artifactId=integrated-design`、`version`）。

### `ask_decision`
- 对 `decisions` **逐项** AskUserQuestion（遵循 `references/interaction-guidelines.md`，按 decision.askMode 选 single_select/multi_select/confirm_gate）。
- 每项 resolve：
```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-decisions.js resolve <taskPath> <slug> <decision.id> '<resolution json>'
```
- 全部 resolve 后重读 inspect。

### `run_gate`
- 执行 Template Check（`design-template-check`）与 Quality Check（`design-quality-gate`），由主会话按 checklist 判断。
- 结果落盘（status ∈ pass|warn|fail；requires_human 改走 ask_decision）：
```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-design.js record-gate <taskPath> <stage> <status> '<checks json>'
```
`<checks json>` 形如 `{"templateChecks":[...],"qualityChecks":[...]}`。
- 重读 inspect：fail → revise；pass/warn → run_review。

### `run_review`（多视角并行派发 + record-review）
- 读取当前冻结 Draft 的 `draftRef`（inspect 返回）。
- 查评审视角表得该 artifact 的 N 个视角：
  - business-design → SE
  - solution-design → SA、MDE、TSE
  - implementation-design → SE、DEV、TSE
  - test-design → SA、SE、MDE
  - integrated-design → 4 个承接维度（见下"Integrated 评审"段，reviewer 为 `business-traceability` / `implementation-traceability` / `test-traceability` / `baseline-consistency`）
- 对设计阶段（前 4 个 artifact）：**并行派发** N 个 Review Subagent（Agent 原语，单次 message 多 Task 并发），每个加载 `feature-review` skill，派发 prompt 注入：
  - `draftPath`、`draftHash`、`version`（来自 `draftRef`）
  - `artifactSlug`（= 该 stage 的 slug，例如 `solution-design`；Subagent 必须把输出 `artifactId` 填成此 slug，`applyReviewResults` 会按 slug 校验）
  - `reviewProfile=agents/<role>.md`（指向对应 agent 文件的"设计评审"段）
  - `allowedReads`（`work/<stage>/{analysis,discovery,design}.md`、`evidence/`、`decisions/`、上游 `artifacts/`）
  - `round`（当前评审轮次）
- 收齐 N 份 `{reviewer, artifactId, artifactVersion, issueFindings, closureDecisions, summary}`。
- 合并落盘（一次调用提交全部 N 视角 snapshots）：
  ```bash
  node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-design.js record-review <taskPath> <stage> '<snapshots json>'
  ```
  `<snapshots json>` 为数组，每个元素 `artifactId` 必须等于该 stage 的 slug。
- 重读 inspect：open blocking/apply → revise；通过 → baseline。
- Draft hash 变（任何 revise 后）→ 旧 findings 全失效 → 重新 Gate + 重新派发全部 N 视角。

### Integrated 评审（4 个承接维度，不走 `agents/*.md`）
integrated-design 的 `run_review` 并行派发 4 个 Review Subagent，每个加载 `feature-review` skill，`reviewProfile` 为下列维度 checklist（由派发 prompt 直接注入维度定义，**不**引用 `agents/*.md`）。每个 Subagent 同样接收 `artifactSlug=integrated-design`、`draftPath`、`draftHash`、`version`、`allowedReads`（四阶段 `artifacts/*.md` + `work/integrated-design/draft.md` + `decisions/`）、`round`：
- **业务承接（reviewer=business-traceability）**：business-design 中的业务要求是否全部被 solution/implementation/test 承接（每条业务要求都能沿 REQ→ARCH→MOD→TEST 追溯到落点）。
- **实现承接（reviewer=implementation-traceability）**：solution-design 的接口 / 数据 / 模块划分是否被 implementation-design 完整承接，无悬空接口或缺失模块。
- **测试承接（reviewer=test-traceability）**：关键需求 / 关键接口 / 关键风险是否被 test-design 承接（覆盖关键场景与风险对冲）。
- **基线一致（reviewer=baseline-consistency）**：四 artifact 的 version / hash / Gate / Review / Baseline 是否自洽（无版本错位、hash 漂移、未合入的 review、缺失 baseline）。

收齐后同样调：
```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-design.js record-review <taskPath> integratedDesign '<snapshots>'
```

### `baseline`
- 人工批准（按 workflow mode；strict/collaborative 需 AskUserQuestion confirm_gate）后发布：
```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-design.js publish <taskPath> <stage>
```
- publish 原样复制 draft → artifact，校验 hash 一致，写 baseline ref。**publish 不修改 draft 内容**；若仍需改，应回到 revise。
- **若 inspect 返回 `complete`（仅 integrated baseline 后）**，推进任务状态：
  ```bash
  node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js set-task-status ${CLAUDE_PROJECT_DIR} design_ready
  ```
  结束（下次 `/workflow` 路由到 feature-approve）。
- 否则（`stage_complete`）重读 inspect，由 `current-stage` 推进到下一阶段。

### `ask_review`
- 对 `action.issues` 中的 pending advisory / risk_candidate **逐项** AskUserQuestion（遵循 `references/interaction-guidelines.md`）：
  - advisory → single_select：`apply`（纳入本轮修订）/ `no_change`（维持现状）。
  - risk_candidate → single_select：`apply`（纳入本轮修订）/ `accepted_risk`（已知并接受）/ `mitigated`（已缓解）/ `rejected`（不成立）。
- 每项决策落盘（与 `record-review` 一致，仅 Lead 写 matrix）：
  ```bash
  node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-review-matrix.js close <taskPath> <issue.id> --decision <decision> --closure "<一句话决策依据>"
  ```
- 全部 resolve 后重读 inspect：apply → `run_stage/revise`（纳入 `getRevisionItems`）；no_change/accepted_risk/mitigated/rejected → `baseline`。

### `complete`
- integrated 已 baseline。推进 `design_ready`：
  ```bash
  node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js set-task-status ${CLAUDE_PROJECT_DIR} design_ready
  ```
  结束（下次 `/workflow` 路由到 feature-approve）。

### `stage_complete` / `blocked`
- `stage_complete`：当前阶段已 baseline 且非终态；重读 `current-stage` 自动进入下一阶段。
- `blocked`：展示 reason，停止，等人工介入。

## 约束

- **不依赖 Agent Teams** —— 不检查 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`，不 bootstrap 设计团队，不 spawn/wake/message 稳定 teammate。Review Subagent 是一次性 Agent 原语派发，不持久化 ID。
- **不自行写流程状态 / artifact / review matrix / decisions** —— state 只经 `publish` 或 `set-task-status`；artifact 只经 `publish`；decisions 只经 CLI；review matrix 只经 `record-review`；gate 只经 `record-gate`。
- **专业推演在主会话完成** —— analysis/discovery/design/draft 由主会话 + Stage Skill 产出；Subagent 仅用于有界 Review（每个视角一个一次性 Subagent）。
- **阶段切换卸载上游推演** —— Baseline 后只保留下游所需 Artifact 摘要，不在主会话累积上游 analysis/discovery/design 全文。
- **integrated 不引入新设计事实** —— assemble 仅汇总与追溯，新增决策须回到对应阶段 revise。
