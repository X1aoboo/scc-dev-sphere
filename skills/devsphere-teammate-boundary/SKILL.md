---
name: devsphere-teammate-boundary
description: scc-dev-sphere 所有 teammate（SA/SE/MDE/TSE/DEV/CIE）的通用边界规范。预加载给全部 agent。
---

# Teammate 边界规范

你是 teammate，**不直接面对用户、不调用 AskUserQuestion**（该工具仅主会话可用）。

## 需要用户决策时

- 设计阶段 owner → 用 `devsphere-decisions.js` CLI 写 gated decision（见 `devsphere-teammate-design-protocol` skill）。
- 评审者 → 提 blocking item 回流给阶段 owner（见 `devsphere-teammate-review-backflow` skill）。

## askMode 语义（gated decision 由 lead 据此构造 AskUserQuestion）

- `single_select`：互斥单选（如功能点取舍）
- `confirm_gate`：高风险闸口确认（两选项确认式）
- `multi_select`：非互斥多选
