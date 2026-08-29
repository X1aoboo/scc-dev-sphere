---
name: feature-clarify
description: 在进入设计前编排需求澄清、独立 Review 和用户批准。以完整原始需求为基础记录目标、边界和验收的补充或修正，使 inputs 目录中的需求输入共同构成获批 Requirement Baseline。
---

# Requirement Clarification

本 Skill 只编排需求澄清交付。分析方法由 `feature-clarify-analysis` 负责；本文不重复定义。

## 创建执行任务

立即使用当前环境的任务管理能力为当前一个设计活动创建以下3个线性顶层任务，并将第一项标记为 `in_progress` 后再开始实质工作：

1. **澄清、确认并记录需求**
2. **独立 Review 并修订**
3. **获得用户批准**

任务状态必须投影当前实际工作焦点。本次活动尚未完成时，始终只有当前一项任务处于 `in_progress`，后续任务保持 `pending`。开始下一项任务的任何实质工作前，先将当前任务标记为 `completed`，再将下一项标记为 `in_progress`；等待用户回答或 Reviewer 返回时，当前任务保持 `in_progress`。只有对应完成条件实际满足后才能完成任务；任务更新返回成功后，以该结果继续推进，不重复提交相同状态。

## 任务 1：澄清、确认并记录需求

从调用上下文取得 `taskPath`、全部 `requiredArtifacts` 和 `clarificationPath`。`inputsPath` 为 `<taskPath>/inputs`；完整读取 `requiredArtifacts` 中的全部文件，不得只读取 `proposal.md`。已存在的 `clarificationPath` 用于恢复此前记录。

随后直接调用 `/scc-dev-sphere:feature-clarify-analysis`，将全部需求输入作为分析上下文，由它完成需求分析和用户确认。

用户确认后，读取 [requirement-clarification-contract.md](references/requirement-clarification-contract.md)，将已经确认的需求澄清结果写入 `clarificationPath`。只做符合 Contract 的组织和记录，不重新分析，不重写完整原始需求，也不引入 Draft。

完成条件：用户已确认需求澄清结果；`clarificationPath` 已完整记录该结果。

## 任务 2：独立 Review 并修订

读取 [requirement-clarification-review.md](references/requirement-clarification-review.md)，创建全新的独立 Reviewer Subagent。只向 Reviewer 提供路径：

- `inputsPath`
- `clarificationPath`
- `contractPath`
- `reviewGuidePath`

Reviewer 必须自行完整读取这些文件，并返回 Review Guide 规定的有效结果。结果缺失、报错、格式无效或仅返回运行状态时，本任务保持阻塞；不得由主会话自行评审或宣告通过。

文档记录遗漏可以在当前任务修复后重新 Review。finding 暴露需求语义问题、未关闭决策或用户意见变化时，重新调用 `/scc-dev-sphere:feature-clarify-analysis` Skill，取得用户确认后更新澄清文件并完整复评。

完成条件：独立 Review 返回 `pass`，全部 blocking finding 已关闭，结果对应当前文件内容。

## 任务 3：获得用户批准

向用户展示最终需求澄清结果、Review 结论，并明确说明 `inputs/` 目录中的所有文件共同构成后续设计的 Requirement Baseline。请求用户明确批准。

批准只改变澄清结果的效力，不复制、不发布或改写文件。用户批准前不得进入设计。

完成条件：用户明确批准当前需求澄清结果。

## 完成

只有需求澄清结果通过独立 Review、blocking finding 全部关闭且用户明确批准，才宣布完成，并向外层调用者准确返回：

> 需求澄清结果已经用户批准

不要自行读取或修改外层工作流状态。
