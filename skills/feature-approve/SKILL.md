---
name: feature-approve
description: 对 Feature Design Baseline 集合执行总体人工批准；用于设计工作空间已同步为 design_ready、准备进入 implementation planning 时。
---

# Feature Approve

这是设计与实现之间的顶层人工门禁，不重新执行设计活动。

## 前置检查

运行：

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-approval.js validate-design-ready <taskPath>
```

必须满足：

- `state.status` 为 `design_ready`；
- `state.requiredDesignTypes` 声明的 Design Baseline 均存在；
- 每份 Baseline 都有绑定当前 hash 的人工批准。

## 总体批准

向用户展示当前 Baseline 集合的类型、版本、hash、摘要、关键风险、限制条件和实施准备度，明确询问是否批准进入实现规划。

用户批准时运行：

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-approval.js approve-design <taskPath> '<approval-json>'
```

命令把当前 Baseline 集合及其 hash 写入 `approvals/design-final-approval.json`，然后将顶层状态更新为 `approved_for_implementation`。

完成条件：总体批准记录精确绑定当前 Baseline 集合；只有明确的人类批准才能推进状态。
