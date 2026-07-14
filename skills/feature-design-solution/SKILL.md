---
name: feature-design-solution
description: 方案与架构设计。SE Agent 基于 business-design，产出含 C4/4+1 视图、接口契约、数据模型、质量属性与架构决策的 solution-design.md，并向 implementation/test 交接。
---

# Feature Design — 方案设计

系统方案与架构设计 Skill。SE Agent 产出 `artifacts/solution-design.md`，对 implementation-design 与 test-design 生成交接契约。

## 集成契约

- **入口:** `/scc-dev-sphere:feature-design-solution [--mode revise]`
- **模式:** 本 skill 是纯领域方法论。team-lead 派发你执行时,按 skill 全流程做设计;需用户决策时按你的 teammate 行为准则(devsphere-teammate-conduct)处理。不关心外部编排流程。
- **入参:** `artifacts/business-design.md`、架构规范查询、`templates/artifacts/solution-design.md`
- **输出:** `artifacts/solution-design.md`、evidence、`decisions/solution-design-decisions.json`、交接契约
- **完成标准:** 见文末

## 前置条件

- 存在 active feature task。
- `artifacts/business-design.md` 存在且上游 business design 已通过当前流程门禁。
- `solutionDesign` 状态为 `not_started`/`drafted`，或修订模式。
- 已 `human_approved` 则必须 `--mode revise`。

## 输入与写入范围

**读取：** business-design、business decisions、方案模板、`state.json`、架构规范（`knowledge-query`）。
**允许写入：** `artifacts/solution-design.md`、`decisions/solution-design-decisions.json`、`evidence/` 与 registry。
**禁止写入：** business/implementation/test 产物、`state.json`、`reviews/`、`approvals/`。评审任务由 `feature-review` Skill 负责写入角色评审快照。

## 执行步骤

> 以下步骤描述完整设计。scope 模式只执行到「出土 decisions」即停（不写主产物）；draft 模式基于已 resolved 的 decisions 执行完整步骤产出主产物。

1. 解析 business-design 的目标、业务规则、状态模型、验收标准、assumption。
2. 识别架构目标、约束、非目标；建立需求到架构的追溯（REQ/BR → ARCH/API/MOD）。
3. 绘制系统上下文图与 **C4 视图**（Context → Container → Component，按需下钻）。
4. 按复杂度/风险生成 **4+1 视图覆盖矩阵**（logical/development/process/physical/scenario），中高风险必须覆盖受影响视图。
5. 设计系统边界、模块边界与依赖方向。
6. 设计**接口契约**（request/response/error/auth/version/兼容性）与**数据模型/数据流**（所有权、迁移、回滚）。
7. 设计集成（同步/异步、超时、重试、幂等）。
8. 用场景化方法表达**质量属性**（source/stimulus/environment/response/measure），可验证。
9. 执行轻量 ATAM（候选方案、敏感点、trade-off、风险）与安全 STRIDE（涉权/PII/外部输入）。
10. 记录架构决策（DEC ID）与架构风险（RISK ID、影响、缓解、owner）。
11. 填写对 implementation-design 与 test-design 的交接契约。
12. 若涉及部署/配置/迁移/数据变更 → 标记触发 CIE。
13. 触发质量门禁。

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

- C4：Context/Container/Component 用 `flowchart` 或 C4-like 表达，层级不混。
- 4+1：视图覆盖矩阵（表格），scenario 用 `sequenceDiagram`，physical 用 deployment 图。
- 数据：ER 图 / 数据流图；接口契约：表格或 OpenAPI/AsyncAPI 引用。
- 所有图后必须附说明。

## Evidence / Decision / Assumption

- 接口契约、系统边界声明必须可追溯到 EV 或 DEC。
- 关键架构取舍写 DEC；风险写 RISK。
- 无证据前提标 ASM；高风险 ASM 人工确认。

## 质量门禁

对应 `docs/governance/design-quality-gates.md`：
- `QG-TPL-001/002`（design-template-check）
- `QG-SD-002/003/004`、`QG-API-001`、`QG-DATA-001`、`QG-NFR-001`、`QG-SEC-001`、`QG-DEC-001`、`QG-RISK-001`（design-quality-gate --target solution-design）

> 由 `design-template-check` 与 `design-quality-gate --target solution-design` 执行；产出 `quality-gates/TPL-*.json` 与 `QG-*.json`。

## 失败处理

- business-design 缺关键字段 → 退回 business 阶段或标缺口为 assumption 并确认。
- 架构方案存在不可行冲突 → 记录 RISK，发起人工确认，必要时退回 business。
- 规范/知识库缺失 → 标 assumption，不臆造标准。
- 不可逆架构决定且信息不足 → 停止，输出候选方案 + trade-off，人工裁决。

## 修订模式（`--mode revise`）

1. 在 solution decisions 记录原因。
2. 分析对 implementationDesign / testDesign 的影响。
3. 递增 version，重置受影响下游阶段为 `drafted`，标记重新评审。

## 下游交接契约

- **给 feature-review**：ready-for-review + artifactId / version。
- **给 implementation-design**：模块边界、接口契约、数据模型、NFR、风险。
- **给 test-design**：接口契约（契约测试）、质量属性场景、风险。
- **给 CIE**（条件触发）：部署/配置/迁移/数据变更项。

## 完成标准

- 业务规则被方案承接（无关键缺口）。
- 接口、数据、NFR、风险可被实现和测试。
- 关键取舍有 DEC ID；风险有 owner。
- C4/4+1 按风险覆盖；图后说明完整。
- 涉及部署/迁移时已标记触发 CIE。

## 禁止事项

- 不写代码级实现细节（属于 implementation）。
- 不接受风险、不关闭 review issue、不推进 `design_ready`。
- 不改其他阶段产物与 `state.json`。
- 不在未确认情况下把高风险架构取舍当定论。
