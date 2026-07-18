---
name: feature-design-business
description: 业务设计阶段的专业方法论。主会话按 inspect 的 run_stage.activity 调用 analyze/discover/design/revise，产出到 work/business-design/。不写 artifacts（由 publish 发布）、不写 state/reviews、不自行询问用户。
---

# Feature Design — 业务设计

业务设计阶段的领域方法论 Skill。主会话按 `inspect` 返回的 `run_stage.activity` 调用本 skill 的对应活动，产出写入 `work/business-design/`，最终 draft 经 Gate/Review/Baseline 发布为 `artifacts/business-design.md`。

本 skill 不携带 SA Agent 身份，不读取 workflow mode，不调用 `devsphere-teammate-conduct`，不自行 `AskUserQuestion`——发现需用户判断的事项时写 pending decision。

## 集成契约

- **入口:** 由 `feature-design` skill 在 `run_stage`（stage=`businessDesign`）动作中加载，按 activity 执行。
- **activity 入参:** `analyze | discover | design | revise`（revise 附 revision items 来源）。
- **读取:** `inputs/requirement.md`、`templates/artifacts/business-design.md`、`evidence/`（含 `evidence-registry.json`、`EV-*`）、`decisions/business-design-decisions.json`。
- **允许写入:** `work/business-design/{analysis,discovery,design,draft}.md`、`evidence/`（含 `evidence-registry.json`、`evidence/knowledge/EV-*`）、`decisions/business-design-decisions.json`。
- **禁止写入:** `artifacts/`、`state.json`、`reviews/`、`approvals/`、`quality-gates/`、其他阶段 work 目录。
- **用户决策:** 发现需用户判断时写 pending decision（`node scripts/devsphere-decisions.js add <taskPath> business-design <json>`），不自行 `AskUserQuestion`。主会话在 `ask_decision` 动作统一询问。
- **完成信号:** 每个 activity 完成后由主会话调 `mark-ready <taskPath> businessDesign <analysis|discovery|design>`。

## Analyze（产出 `work/business-design/analysis.md`）

目标：明确本阶段要回答的问题，形成调查计划，**不**产出正式设计。

关注点：

1. 从 `inputs/requirement.md` 提取初始 REQ / BR / NFR 候选并编号（REQ-xx、BR-xx、NFR-xx，沿用模板命名）。
2. 识别业务目标、干系人、用户角色（覆盖主要使用者与运营/审核方）。
3. 划定 In Scope / Out of Scope 边界。
4. 识别信息缺口、口径冲突、未明确的业务规则——分类为「可调查事实」与「必须用户确认」。
5. 判断哪些信息可从知识库（`knowledge-query`）或上游文档获得。
6. 形成调查清单（受影响领域、存量业务规则、历史需求、当前系统行为）。

`analysis.md` 包含：阶段目标、上游输入摘要、初步理解、范围/边界、待调查问题、待用户确认事项、调查计划。Analyze 完成只表示调查问题已明确，不表示理解已被证明。

完成后由主会话调 `mark-ready <taskPath> businessDesign analysis`。

## Discover（产出 `work/business-design/discovery.md` + evidence + decisions）

目标：按调查计划收集事实，综合为正式设计输入。

调查项：

1. 经 `knowledge-query` 查询受影响领域的存量业务规则、历史需求、当前系统行为；将实际采用的事实保存为 `evidence/knowledge/EV-*` 并登记到 `evidence-registry.json`。
2. 识别证据冲突、证据缺失、不确定结论——未经证明的前提标 ASM。
3. 将需要用户取舍的问题记 pending decision（gated / autonomous 按 brief 中 decisionPolicy 由主会话策略决定；本 skill 只负责结构化记录）。
4. 综合调查结果为正式设计输入摘要。

`discovery.md` 包含：调查项与查询范围、关键发现、evidence 引用、现状约束、冲突/未知项、对设计的影响。原始事实放 `evidence/`，本文件只保存综合结论与引用，不复制大段知识。

发现新的重大未知项时可经主会话返回 Analyze 补充调查计划（不新增工作流状态）。

完成后由主会话调 `mark-ready <taskPath> businessDesign discovery`。

## Design（产出 `work/business-design/design.md` + `work/business-design/draft.md`）

目标：基于已确认的 analysis/discovery，完成业务设计推演并生成完整 Draft。

### design.md（设计推演）

保存候选方案、关键取舍、推演过程、被拒绝方案、与 evidence/decision 的关联、对 Draft 各部分的设计输入。不要求符合 Artifact 模板。

### draft.md（正式候选）

完整符合 `templates/artifacts/business-design.md`，frontmatter 含 `artifactId` + `version`（目标 Baseline 版本，本轮修订不递增，由 hash 使旧 Gate/Review 失效）。仅包含已收敛设计，不包含占位符、内部讨论、未确认候选。

专业方法论（迁入此处）：

- **干系人与用户角色：** 覆盖主要使用者与运营/审核方，角色 / 影响 / 关注点。
- **业务流程建模：** Mermaid `flowchart`，覆盖正常流、异常流、替代流，图后附文字说明。
- **业务状态模型：** Mermaid `stateDiagram-v2`，含异常/终止状态。
- **决策表：** 条件组合 → 结果。
- **业务规则清单：** 每条带 BR ID、来源（EV/ASM）、可验证表达。
- **验收标准：** 可转测试场景，与 REQ/BR 可追溯。
- **需求追溯矩阵：** REQ → BR → AC，无关键孤儿。
- **In/Out Scope：** 明确边界，小任务允许写「不适用，理由：…」但不得默认留空。
- **领域术语：** 统一术语表。

Evidence/Decision/Assumption 使用要求：

- 存量业务行为结论必须引用 EV ID；无证据则标 ASM。
- 关键取舍写 DEC 到 `decisions/business-design-decisions.json`。
- 高风险 assumption（confidence 低 / needsConfirmation）转 gated pending decision，不得当事实推进。

Draft 完成后由主会话触发 Gate（`run_gate` 动作）；本 skill 不自行调用 Gate 或推进 Review。

## Revise（更新 `design.md` + `draft.md`）

修订触发由主会话 `inspect` 返回：Gate fail、Review blocking、advisory 被选 apply、risk_candidate 需修改、用户拒绝。

修订活动：

1. 读取全部 revision items（来自 Gate/Review，统一汇总，不按来源零散改）。
2. 必要时回 Analyze/Discover 补充（如新 evidence 推翻原判断）。
3. 在 `design.md` 记录修订推演；在 `decisions/business-design-decisions.json` 记录关键修订 decision。
4. 更新 `draft.md`——**不跳 Gate**，不递增 version（同 Baseline 轮次），draft hash 改变使旧 Gate/Review 自动失效。
5. 重新进入 Validate。

业务设计修订时应重查的内容：

- 需求追溯矩阵是否仍无关键孤儿。
- 业务规则来源（EV/ASM）是否仍有效。
- 状态模型/决策表是否与修订后的流程一致。
- 下游（solution/test）交接字段是否仍完整。

## 完成标准

- `analysis.md`：阶段目标、待调查问题、待用户确认事项明确，无空段。
- `discovery.md`：必要调查项有结论或明确缺口；关键事实有 EV 引用；高风险未知项已转 pending decision。
- `design.md`：候选方案与取舍推演可追溯至 EV/DEC。
- `draft.md`：完整符合 Artifact 模板，无占位符；每条关键业务规则有 BR ID + 来源（EV/ASM）；Scope 明确；异常/替代流非空或有「不适用」理由；验收标准可测试；追溯矩阵无关键孤儿；对 solution-design 的交接字段完整。

## Context pointers

- Artifact 模板: `templates/artifacts/business-design.md`
- Gate catalog: `docs/governance/design-quality-gates.md`（`QG-TPL-001/002`、`QG-EV-001`、`QG-BD-001~011`、`QG-TR-001`、`QG-ASM-001`）
- 上游 artifact: `inputs/requirement.md`
- 下游消费者: `feature-design-solution`（业务目标、业务规则、状态模型、验收标准、assumption）、`feature-design-test`（验收标准、关键业务规则）。
