# Decisions 文件

每条 decision 的结构（SA/SE/MDE/TSE 产出，主会话读 gated pending 代问用户）：

| 字段 | 说明 |
|------|------|
| id | `<PREFIX>-DEC-NNN`（BD/SD/ID/TD） |
| type | `gated`（需用户拍板）/ `autonomous`（自决仅记录） |
| category | feature_scope / assumption / open_question / business_rule / tradeoff |
| summary | 决策一句话 |
| rationale | **gated 必填。** 从 knowledge-query 发现 → 不确定点 → 若不决策的后果。用户看 AskUserQuestion 时这就是决策背景；信息不足 = 用户判断失准。 |
| options | gated 必填，2-4 项 `{label: string, description: string}`。`label` 简短（≤25字），对应 AskUserQuestion 选项标题；`description` 详细——解释该选项的具体含义、取舍代价、适用场景，足够支撑用户做出独立判断。纯字符串选项被脚本校验拒绝。 |
| recommendation | 推荐项 |
| askMode | single_select / multi_select / confirm_gate（gated 必填） |
| status | pending / decided |
| resolution | decided 时 {chosen, note, decidedAt} |
| evidence | [EV-xxx] |
| impact | 对下游阶段的影响 |

闸口只看 `type=gated && status=pending`；整个文件是该阶段决策日志。
