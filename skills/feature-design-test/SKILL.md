---
name: feature-design-test
description: 风险驱动测试设计。TSE Agent 综合三类设计，建立风险→测试追溯，产出含测试金字塔、契约测试、回归范围、不可测项与转测准入的 test-design.md。
---

# Feature Design — 测试设计

风险驱动测试设计 Skill。TSE Agent 产出 `artifacts/test-design.md`，对 verification/test-handoff 生成交接契约。

## 集成契约

- **入口:** `/scc-dev-sphere:feature-design-test [--mode revise]`
- **模式:** 本 skill 是纯领域方法论。team-lead 派发你执行时,按 skill 全流程做设计;需用户决策时按你的 teammate 行为准则(devsphere-teammate-conduct)处理。不关心外部编排流程。
- **入参:** `artifacts/business-design.md`、`artifacts/solution-design.md`、`artifacts/implementation-design.md`、测试规范查询、`templates/artifacts/test-design.md`
- **输出:** `artifacts/test-design.md`、evidence、`decisions/test-design-decisions.json`、交接契约
- **完成标准:** 见文末

## 前置条件

- 存在 active feature task。
- business/solution/implementation 设计存在且已 `ai_review_passed`/`human_approved`。
- `testDesign` 状态为 `not_started`/`drafted`，或修订模式。
- 已 `human_approved` 则必须 `--mode revise`。

## 输入与写入范围

**读取：** 三类设计产物、各自 decisions、测试模板、`state.json`、历史缺陷/测试规范（`knowledge-query`）。
**允许写入：** `artifacts/test-design.md`、`decisions/test-design-decisions.json`、`evidence/` 与 registry。
**禁止写入：** 其他阶段产物、`state.json`、`reviews/`、`approvals/`。评审任务由 `feature-review` Skill 负责写入角色评审快照。

## 执行步骤

> 以下步骤描述完整设计。scope 模式只执行到「出土 decisions」即停（不写主产物）；draft 模式基于已 resolved 的 decisions 执行完整步骤产出主产物。

1. 解析 business（业务规则/验收标准）、solution（接口契约/质量属性/风险）、implementation（状态机/错误路径/测试钩子/风险）。
2. 建立**风险驱动追溯**：业务规则、架构风险、实现风险 → TEST，明确每类测试在防什么风险。
3. 定义测试目标、范围（测什么/不测什么）、策略与**测试金字塔映射**（unit/contract/integration/e2e 比例与理由）。
4. 设计 unit、**接口契约测试**（request/error/auth/compat）、integration、e2e、regression 测试。
5. 设计 boundary、negative、permission/security、performance、compatibility 测试。
6. 明确测试数据、测试环境、Mock/Stub、自动化建议（测试类型/命令/owner，可进入 DEV plan）。
7. 定义**回归范围**（引用 evidence/缺陷历史），避免只靠 E2E。
8. 标记**不可测项**（原因、影响、缓解、owner）与风险接受候选（不得自动变 accepted_risk）。
9. 定义**转测准入标准**（可检查 checklist）。
10. 触发质量门禁。

## vague 需求拆解框架

面对一句话/信息不足的需求,不要自填假设。按维度逐项判断,每个需求未提及的维度出土一条 decision:
- 用户角色与权限
- 核心实体与生命周期
- 功能范围(In/Out Scope)
- 关键业务规则
- 非功能需求(性能/安全/兼容)
- 与下游(solution/test)的交接边界
vague 需求 = 大量空白维度 = 必须明确；是否需要 Lead 决策由派发 prompt 的 decisionPolicy 决定。

## 专业方法与图示

- 需求/风险 → 测试追溯矩阵（表格，REQ/BR/API/MOD/RISK → TEST）。
- 测试金字塔（表格或图，标注层级比例与理由）。
- 测试场景表（ID/前置/步骤/预期）。

## Evidence / Decision / Assumption

- 回归范围、缺陷引用必须有 EV 或缺陷 ID。
- 测试策略取舍（如缩减范围）写 DEC。
- 不可测项必须有原因 + 缓解；高风险不可测项发起人工确认。

## 质量门禁

对应 `docs/governance/design-quality-gates.md`：
- `QG-TPL-001/002`（design-template-check）
- `QG-TD-002/003/004/007`、`QG-TR-003`、`QG-RISK-003`（design-quality-gate --target test-design）

> 由 `design-template-check` 与 `design-quality-gate --target test-design` 执行；产出 `quality-gates/TPL-*.json` 与 `QG-*.json`。

## 失败处理

- 上游设计缺关键字段 → 退回对应阶段或标缺口并确认。
- 历史 defect 数据不可用 → 回归范围标 assumption，不臆造范围。
- 不可测项属高风险且无缓解 → 发起人工确认，记录 risk_candidate。
- 测试环境不可用 → 记录到测试环境需求，不阻断设计起草。

## 修订模式（`--mode revise`）

1. 在 test decisions 记录原因。
2. 分析对 verification/test-handoff 的影响。
3. 递增 version，标记重新评审。

## 下游交接契约

- **给 feature-review**：ready-for-review + artifactId / version。
- **给 verification（test-handoff）**：转测准入 checklist、测试场景、测试数据/环境需求、自动化建议。
- **给 DEV**：自动化测试任务（类型/命令/owner，可入 plan）。

## 完成标准

- 关键业务规则和高风险项在追溯矩阵中无孤儿。
- 测试金字塔层级明确，非仅 E2E/人工。
- 不可测项有原因 + 缓解；高风险项经人工确认。
- 回归范围引用 evidence/缺陷。
- 转测准入标准可执行（checklist）。

## 禁止事项

- 不自动把不可测项/风险候选变为 accepted_risk（必须人工确认）。
- 不臆造缺陷或回归范围。
- 不改其他阶段产物与 `state.json`。
