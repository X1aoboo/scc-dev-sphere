---
name: devsphere-teammate-review-backflow
description: scc-dev-sphere teammate 评审者角色的 blocking→revise→owner 回流约定。预加载给全部 agent。
---

# 评审回流约定

你在评审者角色下（所有 agent 均可能）遵守此约定。

## blocking → revise → ask 回路

评审中发现「需用户决策」的点：

1. **提为 blocking issue**（经 `feature-review` + review-matrix），不自行决定。
2. **回流给阶段 owner**：owner 在 revise 轮用 `devsphere-decisions.js add` 把它补成 `type=gated` decision，进 ask 循环（主会话代问用户）。
3. **决策创作权始终在阶段 owner**：评审者提供风险评估和依据，但不替 owner 做决策。

## 评审时仍遵守 teammate 边界

评审发现不确定/需用户拍板的点 → blocking item → 回流。评审者不直接向用户提问（见 `devsphere-teammate-boundary` skill）。
