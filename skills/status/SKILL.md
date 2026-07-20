---
name: status
description: 只读展示当前任务顶层状态、Design Baselines、未完成设计活动、Draft/Lint/Review、批准记录和下一步建议。
---

# Status

只读检查，不修改文件或推进状态。

1. 从 `.devsphere/current-task.json` 定位活跃任务并读取 `state.json`。
2. 运行 `devsphere-design.js inspect-workspace <taskPath>`，展示外层要求的设计类型、已有 Baseline 和从 Work/Draft 推断的当前设计活动。
3. 对未完成候选展示恢复结论、Draft hash、Lint、Review 和 Approval 是否绑定当前 Draft；恢复不确定时明确标记“需要用户确认”。
4. 读取 `approvals/design-final-approval.json`（存在时）。
5. 运行 `devsphere-workflow.js <workspaceRoot>`，只展示顶层下一步建议。

输出包含任务 ID、整体状态、requiredDesignTypes、各 Design Baseline 版本/hash、当前 Work/Draft/Lint/Review、接受风险、总体批准和下一步。设计类型按名称展示，不暗示固定执行顺序。
