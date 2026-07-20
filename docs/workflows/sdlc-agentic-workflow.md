# SDLC Agentic Workflow

## Feature golden path

```text
feature-init → feature-clarify → feature-assess
→ feature-design → feature-approve
→ feature-plan-implementation → feature-implement → feature-verify
```

顶层状态：

```text
initialized → clarified → assessed → designing → design_ready
→ approved_for_implementation → implementation_planned
→ implementing → verification_ready → completed
```

顶层 Workflow 保存稳定状态和 `requiredDesignTypes`，不保存设计活动内部游标。设计类型集合是外部策略，不表达执行顺序。

## Feature Design

`feature-design` 在主会话运行，每次从工作空间事实恢复并完成当前一个设计活动。业务、方案、实现和测试设计使用同一固定方法，但按类型加载不同 Design Guide、Spec 和 Review Checklists。

```text
恢复工作空间并加载专业上下文
→ 语义分析与 design tree/frontier
→ 动态分段并取得用户确认
→ Draft 与 Lint
→ 隔离 Review 与完整复评
→ 人工批准、Baseline 和状态同步
```

当前活动优先从唯一未完成 Work/Draft 推断；多个候选、Draft/Baseline 冲突或证据不足时由用户确认。设计类型之间没有固定顺序和强制上游 Artifact 组合，相关正式 Artifact 按当前目标加载。

## Review and approval

每个适用 Checklist 使用一个新的隔离 Reviewer。Reviewer 完整应用 Checklist 内的评审规则和检查项，直接把 Markdown 结论返回主会话。语义修改使全部适用 Review 失效；纯格式修正只重新 Lint。

每个设计活动的 Baseline 必须绑定当前 Draft、Lint、Review 和人工批准。发布后状态同步能力根据 `requiredDesignTypes` 判断保持 `designing` 或进入 `design_ready`。总体人工批准后才进入实现规划。

## Failure handling

- 缺可调查事实：查询项目或 Knowledge Source。
- 高影响未知：留在 frontier，与用户深入讨论。
- 恢复歧义：展示候选和证据，由用户确认当前活动。
- Lint 失败：修复确定性结构问题；语义变化返回设计讨论。
- Review finding：主会话分析影响并与用户讨论；语义修订后完整复评。
- 状态同步失败：保留当前执行任务未完成，报告持久化不一致。
- 只有无法在当前权限与范围内恢复的外部阻塞才使用顶层 `blocked`。

## Human decisions

用户明确确认设计段落、已确认设计的语义修改、高风险适用性省略、当前设计最终批准、恢复歧义、残余风险接受和总体设计批准。
