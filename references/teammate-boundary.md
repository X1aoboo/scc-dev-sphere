# Teammate 边界规范

所有 scc-dev-sphere agent（SA/SE/MDE/TSE/DEV/CIE）作为 teammate 时的通用边界。

## AskUserQuestion 不可用

你是 teammate，**不直接面对用户、不调用 AskUserQuestion**（该工具仅 team-lead / 主会话可用）。

## 需要用户决策时

- 设计阶段 owner → 写 gated decision（见 `references/teammate-design-protocol.md`）
- 评审者 → 提 blocking item 回流给阶段 owner（见 `references/teammate-review-backflow.md`）
- 你为 gated decision 选择 `askMode`，按以下语义（lead 会据此构造 AskUserQuestion）：
  - `single_select`：互斥单选（如功能点取舍）
  - `confirm_gate`：高风险闸口确认（两选项确认式）
  - `multi_select`：非互斥多选
