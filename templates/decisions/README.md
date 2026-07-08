# Decisions 文件

每条 decision 的结构（SA/SE/MDE/TSE 产出，主会话读 gated pending 代问用户）：

| 字段 | 说明 |
|------|------|
| id | `<PREFIX>-DEC-NNN`（BD/SD/ID/TD） |
| type | `gated`（需用户拍板）/ `autonomous`（自决仅记录） |
| category | feature_scope / assumption / open_question / business_rule / tradeoff |
| summary | 决策一句话 |
| rationale | 背景与依据（含 EV 引用），知识沉淀用 |
| options | gated 必填，2-4 项 {label, description} |
| recommendation | 推荐项 |
| askMode | single_select / multi_select / confirm_gate（gated 必填） |
| status | pending / decided |
| resolution | decided 时 {chosen, note, decidedAt} |
| evidence | [EV-xxx] |
| impact | 对下游阶段的影响 |

闸口只看 `type=gated && status=pending`；整个文件是该阶段决策日志。
