---
name: design-manual-change
description: 人工设计变更：用户直接修改 draft 并人工检视，跳过隔离 AI Reviewer，保留确定性 lint；skill 补记人工检视评审与人工审批后发布新基线，保证一致性校验通过。禁止模型自动调用，仅用户在主会话显式调用。
disable-model-invocation: true
---

# Design Manual Change — 人工设计变更

对**已发布基线**的设计做人工变更：用户直接修改 draft 并自行检视，跳过隔离 AI Reviewer，保留确定性 lint；本 skill 负责编排 reopen、补记人工检视评审、人工批准与发布，使新基线的整条一致性校验（lint → review → approval → publish → 下游入场）全部通过。

## 集成契约

- **入口:** `/scc-dev-sphere:design-manual-change`
- **入参:** 设计类型（存在已发布基线者单选）、变更原因（必填）、人工批准确认（必选）
- **输出:** 新版本基线（major+1）+ `artifacts/history/` 历史快照 + `reviewer: 'human'` 审计记录
- **完成标准:** 新基线已发布、状态已同步、审计记录可区分人工变更

## 执行步骤

1. 定位目标：执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" state get-task-path --workspace-root "<workspaceRoot>"` 取当前任务；对四种设计类型逐一执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" design inspect-design --task-path "<taskPath>" --design-type <designType>`，过滤出 `artifact` 存在的结果（`recovery` 为 `baseline_complete` 或 `needs_user_confirmation`），以单选列表呈现给用户。无可选时提示"无已发布基线的设计"并终止。
2. 分流 reopen：`recovery === 'baseline_complete'` → 执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" design reopen --mode standard --task-path "<taskPath>" --design-type <designType>` 后**暂停**，提示用户直接编辑 `work/<slug>/draft.md` 及配套资产，等待用户明确确认修改完成；`recovery === 'needs_user_confirmation'` → 识别为已有人工修改，执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" design reopen --mode protect --task-path "<taskPath>" --design-type <designType>` 保护已改内容。
3. reopen 后执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" workflow sync-design-status --workspace-root "<workspaceRoot>"` 使任务状态回落。
4. 收集变更原因：以自然语言向用户提问，必填非空。
5. 执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" design lint --task-path "<taskPath>" --design-type <designType>`；失败时按下述"内容保真"规则辅助修复，向用户展示修复 diff 并获确认后重跑，直至通过；无法保真修复时向用户说明冲突点并交回。
6. 执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" design validate-draft --task-path "<taskPath>" --design-type <designType>` 确认 lint 状态绑定当前 draft。
7. 将变更原因写入临时 JSON 文件（`{"reason": "<原因>"}`），执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" design record-manual-review --task-path "<taskPath>" --design-type <designType> --input-file <file>`。
8. 人工批准：向用户呈现变更摘要（原因、版本、lint 结果），获用户**明确确认**后执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" design approve-current-design --task-path "<taskPath>" --design-type <designType> --input-file <file>`，输入 `{"approvedBy": "human", "summary": "manual-design-change: <原因>", "acceptedRisks": []}`；用户不确认则终止，不写批准记录。
9. 执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" design publish --task-path "<taskPath>" --design-type <designType>`，随后 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" workflow sync-design-status --workspace-root "<workspaceRoot>"`。
10. 展示摘要：新基线版本与路径、历史快照位置、`reviewer: 'human'` 审计标记、下游设计入场校验已恢复。

## 规则

- **仅用户显式调用**：不得被模型自动触发；只在用户在主会话输入 `/scc-dev-sphere:design-manual-change` 时执行。
- **内容保真**：不得主动修改 `draft.md` 及配套资产内容；唯二例外是 CLI 的版本号 +1（发生在用户修改之前）与 lint 辅助修复。lint 辅助修复仅限机械性修正（frontmatter 字段、固定结构标题、格式、以用户已写内容为基础的占位符最小补全）；禁止裁剪、删除、概括或改写用户的设计变更内容；无法在不失真的前提下修复时交回用户；修复 diff 必须经用户确认。
- **批准前确认**：批准记录写入前必须向用户呈现变更摘要并获明确确认；用户不确认即终止。
- **确定性执行**：reopen、评审补记、批准、发布、状态同步全部委托 `devsphere` CLI；Skill 不自行拼接路径或写状态文件。
- **非法输入拦截**：无已发布基线、lint 未通过、已有评审状态等错误由脚本拦截，Skill 透传并终止。

## 完成

新基线已发布且任务状态已同步，向用户呈现新基线版本、历史快照位置与人工变更审计标记后完成。
