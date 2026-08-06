---
name: design-reopen
description: 重开指定任务中已基线的设计。选择已发布 Baseline 的设计类型，确认后旧 Baseline 归档、新 Draft 版本提升，自动转入 feature-design 继续修订到发布。禁止模型自动调用，仅用户在主会话显式调用。
disable-model-invocation: true
---

# Design Reopen — 设计重开

重开指定任务中已基线的设计，旧 Baseline 归档到历史目录，新 Draft 提升主版本，随后转入 `feature-design` 完成修订、Review、批准和重新发布。

## 集成契约

- **入口:** `/scc-dev-sphere:design-reopen`
- **入参:** 无调用上下文参数；taskPath 由 CLI 从当前活跃任务获取
- **输出:** 旧 Baseline 已归档，新 Draft 已生成，`feature-design` 已接管后续流程
- **完成标准:** `feature-design` 返回"当前 Design Baseline 已获用户批准并发布"

## 执行步骤

1. 定位当前任务：执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" state get-task-path --workspace-root "<workspaceRoot>"`，从返回 JSON 取 `taskPath`。无活跃任务时提示"未找到活跃任务，请先使用 `/scc-dev-sphere:feature-init` 创建"并终止。

2. 枚举可重开的设计：执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" design inspect-workspace --task-path "<taskPath>"`，从返回 JSON 的 `completed` 数组中取出已基线的设计类型，以单选列表呈现给用户。列表为空时提示"当前没有已发布的 Design Baseline 可重开"并终止。

3. 收集变更说明：以自然语言向用户提问"请说明本次重开的原因和预期变更内容"。变更说明必填——reopen 是设计变更决策，不可无理由执行。

4. 确认重开：向用户展示目标设计类型、当前版本号、变更说明，通过 `AskUserQuestion`（`confirm_gate` 模式）明确请求确认。用户拒绝时终止，不执行任何修改。

5. 执行 reopen：`"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" design reopen --task-path "<taskPath>" --design-type <designType>`，解析脚本输出的 JSON。脚本报错（任务不存在、无 Baseline 等）时透传错误并终止。向用户展示归档路径和新 Draft 版本。

6. 转入 feature-design：直接执行 `/scc-dev-sphere:feature-design`，调用上下文中传入 `taskPath`、`designType`（刚 reopen 的）和变更说明（作为设计目标的一部分）。`feature-design` 步骤1 `inspect-workspace` 会看到"Draft 存在、Baseline 不存在"，识别为恢复进行中的设计；步骤2 使用变更说明作为本次设计修订的输入。

## 规则

- **仅用户显式调用**：不得被模型自动触发；只在用户在主会话输入 `/scc-dev-sphere:design-reopen` 时执行。
- **只重开有 Baseline 的设计**：无 Baseline 的设计不需要 reopen，直接用 `feature-design` 恢复。
- **变更说明必填**：重开是设计变更决策，不可无理由执行。
- **确定性执行**：reopen 操作全部由 `devsphere` CLI 完成；Skill 不自行拼接路径或执行文件操作。
- **下游影响不自动处理**：Skill 只重开用户选定的那一个设计。下游设计的重开由用户在 `feature-design` 完成后自行判断。

## 完成

旧 Baseline 已归档到历史目录，新 Draft 已生成，`feature-design` 已接管修订到发布的完整流程后完成。
