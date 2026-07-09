---
name: feature-design-business
description: 业务设计与需求工程。SA Agent 从需求出发，挖掘隐性知识，建模业务流程/状态/规则，产出可追溯、可测试的 business-design.md，并向 solution-design 交接。
---

# Feature Design — 业务设计

需求工程与业务建模 Skill。SA Agent 分析需求，产出 `artifacts/business-design.md`，并对 solution-design 生成交接契约。

## 集成契约

- **入口:** `/scc-dev-sphere:feature-design-business [--mode revise]`
- **模式:** 本 skill 是领域参考。agent 在 **scope 模式**做上游分析子集（查知识 / 拆功能点 / 出土 decisions），在 **draft 模式**产出完整主产物；模式由编排器（`resolve-design-loop`）派发决定，见 agent 的 teammate 协议。
- **入参:** `inputs/requirement.md`、`templates/artifacts/business-design.md`、知识库查询（`knowledge-query`）
- **输出:** `artifacts/business-design.md`、evidence 快照、`decisions/business-design-decisions.json`、对 solution-design 的交接契约
- **完成标准:** 见文末"完成标准"（不止"文档已写入"）

## 前置条件

- 存在 active feature task（`state.json` 存在）。
- `inputs/requirement.md` 存在且非空。
- `businessDesign` 阶段状态为 `not_started` 或 `drafted`，或处于修订模式。
- 若 `businessDesign` 已 `human_approved`：必须显式 `--mode revise` 才能覆盖。

## 输入与写入范围

**读取：** `inputs/requirement.md`、业务设计模板、`state.json`、知识库。
**允许写入：**
- `artifacts/business-design.md`（主产物）
- `decisions/business-design-decisions.json`
- `evidence/knowledge/EV-*` 与 `evidence/evidence-registry.json`

**禁止写入：** 其他阶段产物、`state.json`、`reviews/`、`approvals/`。

## 执行步骤

> 以下步骤描述完整设计。scope 模式只执行到「出土 decisions」即停（不写主产物）；draft 模式基于已 resolved 的 decisions 执行完整步骤产出主产物。

1. 解析 `inputs/requirement.md`，生成初始 REQ/BR/NFR 候选并编号。
2. 识别业务目标、干系人、用户角色，划定 In Scope / Out of Scope。
3. 经 `knowledge-query` 查询：受影响领域的存量业务规则、历史需求、当前系统行为。
4. **隐性知识挖掘**：对不明确处一次只问一个问题（`AskUserQuestion`），Q&A 落盘为 evidence；不臆测。
5. 建模正常流、异常流、替代流（Mermaid `flowchart`）、业务状态模型（`stateDiagram`）、决策表、领域术语。
6. 产出业务规则清单（每条带 BR ID、来源、可验证表达）与验收标准（可转测试场景）。
7. 构建需求追溯矩阵：REQ → BR → AC，无孤儿需求。
8. 标记 assumption（confidence / needsConfirmation）、open question、decision。
9. 填写对 solution-design 的交接契约（SE 必须消费的字段）。
10. 触发质量门禁（见"质量门禁"）。

## 专业方法与图示

- 业务流程：`flowchart`，含异常/替代路径，图后附文字说明。
- 状态模型：`stateDiagram-v2`，含异常/终止状态。
- 决策表：条件组合 → 结果。
- 小任务允许写"不适用，理由：…"，但不得默认留空。

## Evidence / Decision / Assumption

- 存量业务行为结论必须引用 EV ID；无证据则标 ASM。
- 关键取舍写 DEC ID 到 `decisions/business-design-decisions.json`。
- 高风险 assumption（confidence 低 / needsConfirmation）必须发起人工确认，不得当事实推进。

## 质量门禁

对应 `docs/governance/design-quality-gates.md`：
- `QG-TPL-001/002`（frontmatter + 章节结构）— 由 `design-template-check` 执行
- `QG-EV-001`、`QG-BD-001~011`、`QG-TR-001`、`QG-ASM-001` — 由 `design-quality-gate --target business-design` 执行

> 由 `design-template-check`（结构）与 `design-quality-gate --target business-design`（内容/追溯）执行；产出 `quality-gates/TPL-*.json` 与 `QG-*.json`。

## 失败处理

- 需求信息不足 → 经 `AskUserQuestion` 追问，落盘 open question；不臆造需求。
- 知识库证据冲突 → 标记冲突，发起人工确认，记录到 decision。
- `knowledge-query` 不可用 → 记录缺口为 assumption，不阻断起草。
- 人工阻塞 → 停止，输出当前草稿与阻塞清单。

## 修订模式（`--mode revise`）

若 `businessDesign` 已 `human_approved`：
1. 在 `decisions/business-design-decisions.json` 记录修订原因。
2. 分析对下游 solutionDesign / implementationDesign / testDesign 的影响。
3. 递增 frontmatter `version`。
4. 将受影响下游阶段状态重置为 `drafted`，标记需重新评审。

## 下游交接契约

- **给 feature-review**：声明 ready-for-review，附 artifactId / version。
- **给 solution-design**：业务目标、业务规则清单、状态模型、验收标准、assumption。
- **给 test-design**：验收标准、关键业务规则（用于规则测试追溯）。

## 完成标准

- 每条关键业务规则有 BR ID + 来源 evidence 或 assumption。
- Scope 明确，异常/替代流非空或有"不适用"理由。
- 验收标准可测试。
- 需求追溯矩阵无关键孤儿。
- 对 solution-design 的交接契约字段完整。

## 禁止事项

- 不写实现/技术选型（属于 solution）。
- 不修改其他阶段产物、`state.json`、`reviews/`、`approvals/`。
- 不把高风险 assumption 当事实推进。
- 不残留占位符或空洞内容。
