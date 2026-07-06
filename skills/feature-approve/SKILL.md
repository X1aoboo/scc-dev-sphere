---
name: feature-approve
description: 执行最终设计批准。校验 design_ready 前置条件，生成 design-final-approval.json，将状态推进到 approved_for_implementation。高风险：需要人工确认闸口。
---

# Feature Approve — 最终设计批准

生成最终设计批准。这是一个高风险 Skill，带强制性人工确认闸口。

## 集成契约

- **入口:** `/scc-dev-sphere:feature-approve`
- **入参:** 处于 `design_ready` 的状态、所有设计产物、评审矩阵
- **输出:** `approvals/design-final-approval.json`、`status = approved_for_implementation`
- **完成标准:** 批准记录已写入，状态已更新

## 前置条件检查（硬闸口）

执行前，验证全部以下条件：
1. `state.status === 'design_ready'`
2. 评审矩阵中所有阻塞项已关闭
3. 所有建议项在 `reviews/advisory-confirmation.json` 中有人工确认
4. 所有 `accepted_risk` 已写入 `decisions/*-decisions.md`
5. `integrated-design.md` 包含已接受风险摘要

如果任一前置条件不满足，终止并显示哪些条件未满足。

## 人工确认闸口（强制）

展示批准摘要：

```
⚠️ **最终设计批准**

**任务:** {taskId}
**待批准产物:**
  - business-design.md (hash: {hash})
  - solution-design.md (hash: {hash})
  - implementation-design.md (hash: {hash})
  - test-design.md (hash: {hash})
  - integrated-design.md (hash: {hash})

**批准范围:** {approvedScope}

**已接受风险:** {count} 项
{列出每项风险及简要说明}

**限制条件:** {limitations}
```

然后使用 **AskUserQuestion 工具**获取批准决策（遵循 `references/interaction-guidelines.md` 中的 `confirm_gate` 模式）：

- `header`: "设计批准"
- `question`: "任务 {taskId} 的设计产物已全部通过评审。是否批准此设计进入代码实现？"
- `options`:
  - `label: "✅ 批准设计"` `description: "批准所有设计产物，进入代码实现阶段"`
  - `label: "⏸️ 暂不批准，有顾虑需说明"` `description: "请选择 Other 输入顾虑内容"`
- `multiSelect`: false

用户选择「暂不批准」后可通过 Other 直接描述顾虑，无需额外追问轮次。

## 批准后

1. 生成 `approvals/design-final-approval.json`：
   - approvalId（APP-xxx）、type、taskId
   - 所有已批准的产物路径及内容 hash
   - 批准范围、限制条件
   - approvedBy: "human"、approvedAt: 时间戳

2. 更新 `state.status = 'approved_for_implementation'`。

3. 展示：
```
✅ 设计已批准，可进入代码实现。

**下一步:** /scc-dev-sphere:workflow
  → 将引导你进入实现计划阶段。
```
