---
name: feature-implement
description: 执行代码实现。首次代码变更需要人工确认。完成前生成 diff 摘要。高风险：首次代码变更需要人工确认闸口。
---

# Feature Implement — 代码实现

基于实现计划执行代码变更。高风险 Skill，首次代码变更前有强制性人工确认闸口。

## 集成契约

- **入口:** `/scc-dev-sphere:feature-implement`
- **入参:** 实现计划、repo 绑定、设计产物
- **输出:** 代码变更、`implementation/implementation-log.md`、diff 摘要
- **完成标准:** 代码变更完成，diff 摘要已生成，status → verification_ready

## 前置条件检查

验证 `state.status` 为 `implementation_planned` 或 `implementing`。如果不是，终止并引导用户完成前置阶段。

## 首次代码变更闸口（强制）

如果 `status === 'implementation_planned'`（首次代码变更）：

展示：
```
🔨 **代码实现开始**

**任务:** {taskId}
**目标仓库:** {列出 repo 和分支}
**预计变更:** {实现计划摘要}
**验证命令:** {测试命令}
**关键风险:** {风险摘要}

确认开始代码变更？（输入 YES 开始）
```

等待用户明确输入"YES"。将确认记录写入 `implementation/implementation-log.md`。

确认后：更新 `status = 'implementing'`。

## 实现

1. 按实现计划执行代码变更。
2. 运行测试/验证命令。
3. 修复测试中发现的问题。
4. 如果检测到范围偏差（变更超出实现计划）：
   - 在 implementation log 中记录偏差。
   - 向用户展示偏差摘要并等待确认。
   - 不自动回退——仅标记提醒。

## 声明完成前

生成 diff 摘要：
```bash
git diff --stat
```
记录：
- 修改文件清单
- 变更类型摘要（新增、修改、删除）
- 与实现计划的一致性说明
- 明显的范围偏差

将 diff 摘要写入 `implementation/implementation-log.md`。

如果存在明显的范围偏差，提交给用户确认后再继续。

## 状态更新

代码变更完成且本地验证通过后：
- 更新 `status = 'verification_ready'`。
- 展示：「代码实现完成。使用 /scc-dev-sphere:workflow 进入验证阶段。」
