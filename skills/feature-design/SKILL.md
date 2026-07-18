---
name: feature-design
description: 设计阶段生命周期入口。在主会话(Design Lead)运行：循环咨询 devsphere-design inspect 拿 nextAction，按动作执行，检查完成标准后重读。不依赖 Agent Teams，不管理长期 Agent。
---

# Feature Design — 设计阶段生命周期入口

你在主会话(Design Lead)运行。**你不自行判断阶段流转或动作选择** —— 一律由确定性 `inspect` 决定。你只负责：读 inspect → 按 nextAction 执行 → 检查完成标准 → 重读 inspect。

## 入口

进入设计阶段第一步：
```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js set-task-status ${CLAUDE_PROJECT_DIR} designing
```

随后对当前阶段初始化 Work（幂等）：
```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-design.js init-stage <taskPath> businessDesign
```
`<taskPath>` 从 `devsphere-state.js read-current-task` + `get-task-path` 取。

## 核心循环

每次循环：
1. `node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-design.js inspect <taskPath> [stage]` → stdout 是一个快照 JSON，关注 `nextAction`。
2. 按 `nextAction.kind` 执行（见下）。
3. 执行后**立即重读 inspect**。

## 按 nextAction.kind 执行

### `run_stage`（activity = analyze | discover | design | revise）
- 加载对应 Stage Skill（如 `scc-dev-sphere:feature-design-business`）按 activity 执行专业工作。
- activity=analyze：完成 analysis.md 后，主会话判断达成完成条件 → `mark-ready <taskPath> <stage> analysis`。
- activity=discover：完成 discovery.md、登记 evidence、记 decision/assumption 后 → `mark-ready <taskPath> <stage> discovery`。
- activity=design：生成/更新 design.md 与 draft.md（draft 完整符合 Artifact 模板）。
- activity=revise：读取 inspect 返回的 revision 来源，统一修订 design.md/draft.md；不跳过 Gate。

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

### `run_review`
- 对当前冻结 Draft（inspect.draftRef）按该 artifact 的评审视角（business-design 仅架构向=SE）派发**一次性 Review Job**（主会话直接执行或派 Research/Review Subagent）。
- Review Job 返回 findings 后，经 review matrix CLI 合并并绑定当前 draft hash：
```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-review-matrix.js <merge-cmd> <taskPath> <slug> ...
```
- 重读 inspect：open blocking/apply → revise；通过 → baseline。

### `baseline`
- 人工批准（按 workflow mode；strict/collaborative 需 AskUserQuestion confirm_gate）后发布：
```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-design.js publish <taskPath> <stage>
```
- publish 原样复制 draft → artifact，校验 hash 一致，写 baseline ref。**publish 不修改 draft 内容**；若仍需改，应回到 revise。
- 重读 inspect：→ `stage_complete`。

### `stage_complete` / `blocked`
- `stage_complete`：Batch 1（business）到此停止，报告完成。后续 batch 在此处推进到下一阶段。
- `blocked`：展示 reason，停止，等人工介入。

## 约束

- **不依赖 Agent Teams** —— 不检查 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`，不 bootstrap 设计团队，不 spawn/wake/message 稳定 teammate。
- **不自行写流程状态 / artifact / review matrix / decisions** —— state 只经 `publish`；artifact 只经 `publish`；decisions 只经 CLI；review matrix 只经 review-matrix CLI；gate 只经 `record-gate`。
- **专业推演在主会话完成** —— analysis/discovery/design/draft 由主会话 + Stage Skill 产出；Subagent 仅用于有界 Research/Review。
- **阶段切换卸载上游推演** —— Baseline 后只保留下游所需 Artifact 摘要，不在主会话累积上游 analysis/discovery/design 全文。
