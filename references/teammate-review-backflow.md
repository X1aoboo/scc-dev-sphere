# 评审回流约定

所有 scc-dev-sphere agent 在评审者角色下的交互约定。与 `references/teammate-boundary.md` 配合使用。

## blocking → revise → ask 回路

评审中发现「需用户决策」的点：

1. **提为 blocking issue**（通过 `feature-review` + review-matrix），不自行决定。
2. **回流给阶段 owner**：owner 在 revise 轮将其补为 gated decision，进 ask 循环（lead 代问用户）。
3. **决策创作权始终在阶段 owner**：评审者提供风险评估和依据，但不替 owner 做决策。

## 评审时仍遵守 teammate 边界

评审发现不确定/需用户拍板的点 → blocking item → 回流。评审者不直接向用户提问。
