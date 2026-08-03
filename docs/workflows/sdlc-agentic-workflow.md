# SDLC Agentic Workflow

## Feature golden path

```text
feature-init → feature-clarify → feature-design → feature-approve
→ feature-plan-implementation → feature-implement → feature-verify
```

顶层状态：

```text
initialized → clarified → designing → design_ready
→ approved_for_implementation → implementation_planned
→ implementing → verification_ready → completed
```

顶层 Workflow 保存稳定状态和 `requiredDesignTypes`，不保存设计活动内部游标。设计类型集合是外部策略，不表达执行顺序。

## Feature Design

`feature-design` 在主会话运行，每次从工作空间事实恢复并完成当前一个设计活动。业务、方案、实现和测试设计使用同一固定方法；主会话按类型加载 Design Guide 和 Spec，隔离 Reviewer 通过 CLI 获取内部 Review Policy 及完整 Checklist 集合。

```text
恢复工作空间并加载专业上下文
→ 语义分析与 design tree/frontier
→ 动态分段并取得用户确认
→ Draft 与 Lint
→ 隔离 Review 与完整复评
→ 人工批准并发布 Baseline
```

当前活动优先从唯一未完成 Work/Draft 推断；多个候选、Draft/Baseline 冲突或证据不足时由用户确认。设计类型之间没有固定顺序和强制上游 Artifact 组合，相关正式 Artifact 按当前目标加载。

## Review and approval

每轮冻结 Draft 使用一个隔离 `design-reviewer`。主会话只传 `taskPath` 和 `designType`，不读取 Policy、不选择 Checklist，也不维护 Review 状态。Reviewer 通过 CLI 获得 Policy、正式输入和 Checklist，判断条件项适用性，串行完成评审，持久化 Checklist 处置、结论及 finding 数量，再把包含完整 findings 的 Markdown 结论返回主会话。

Lint 由主会话运行并修复至通过，Reviewer 不重复执行 Lint；CLI 只允许通过当前设计包 hash 的 Lint 状态进入 Review。Draft 修改后必须重新 Lint。Reviewer 根据 semantic hash、Policy hash 和既有 Review 自行选择完整复评或仅刷新格式绑定。

主会话在完成 Review 步骤前运行 `devsphere design validate-review`。该命令只返回当前 Review 是否满足步骤完成条件及问题列表，并以退出码提供确定性完成闸口。

每个设计活动的 Baseline 必须绑定当前 Draft、Lint、Review 和人工批准。每份 Baseline 发布后返回 Workflow，由 Workflow 根据 `requiredDesignTypes` 判断保持 `designing` 或进入 `design_ready`。总体人工批准后才进入实现规划。

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
