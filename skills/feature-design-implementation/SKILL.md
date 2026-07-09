---
name: feature-design-implementation
description: 模块级详细设计。MDE Agent 基于 solution-design 查询代码仓，产出含模块影响、调用链、时序图、状态机、错误/并发/回滚策略的 implementation-design.md。
---

# Feature Design — 实现设计

模块级详细设计 Skill。MDE Agent 产出 `artifacts/implementation-design.md`，对 DEV 实现计划与 test-design 生成交接契约。

## 集成契约

- **入口:** `/scc-dev-sphere:feature-design-implementation [--mode revise]`
- **模式:** 本 skill 是领域参考。agent 在 **scope 模式**做上游分析子集（查知识 / 拆功能点 / 出土 decisions），在 **draft 模式**产出完整主产物；模式由编排器（`resolve-design-loop`）派发决定，见 agent 的 teammate 协议。
- **入参:** `artifacts/solution-design.md`、代码仓查询、`templates/artifacts/implementation-design.md`
- **输出:** `artifacts/implementation-design.md`、repository evidence、`decisions/implementation-design-decisions.md`、交接契约
- **完成标准:** 见文末

## 前置条件

- 存在 active feature task。
- `artifacts/solution-design.md` 存在且 `solutionDesign` 已 `ai_review_passed`/`human_approved`。
- `implementationDesign` 状态为 `not_started`/`drafted`，或修订模式。
- 已 `human_approved` 则必须 `--mode revise`。

## 输入与写入范围

**读取：** solution-design、solution decisions、实现模板、`state.json`、代码仓（实际查询）。
**允许写入：** `artifacts/implementation-design.md`、`decisions/implementation-design-decisions.md`、`evidence/repository/` 与 registry。
**禁止写入：** 其他阶段产物、`state.json`、`reviews/`、`approvals/`、**源代码**（本阶段只设计，不写代码）。

## 执行步骤

> 以下步骤描述完整设计。scope 模式只执行到「出土 decisions」即停（不写主产物）；draft 模式基于已 resolved 的 decisions 执行完整步骤产出主产物。

1. 解析 solution 的接口、数据模型、NFR、风险、模块边界。
2. **查询代码仓影响面**：模块结构、文件路径、关键符号、既有调用链、既有实现模式。
3. 保存 **repository evidence**：只记录路径、符号、调用关系——不复制大段源码。
4. 设计模块职责、文件影响（文件/变更类型/owner）、类/接口/函数签名、DTO/VO/Entity/配置对象。
5. 绘制关键流程**时序图**（`sequenceDiagram`，含失败路径）、**数据流图**、**状态机**（与 solution 一致）。
6. 设计算法/规则实现（BR 可追溯）、API 适配、数据库/配置变更（迁移/回滚）。
7. 覆盖**错误处理、并发与事务、幂等性**策略（高风险项不可空）、性能/安全/兼容要点。
8. 设计日志/监控/指标与**测试钩子**（test seam，支撑可测试性）。
9. 定义**回滚策略**（回滚、降级、残余风险、owner）。
10. 记录实现风险（RISK）、对 DEV 实现计划的交接、对 test-design 的测试输入。
11. 触发质量门禁。

## 专业方法与图示

- 时序图：`sequenceDiagram`，覆盖主要调用链与失败路径。
- 数据流：`flowchart`；状态机：`stateDiagram-v2`。
- 文件影响、DTO/Entity：表格。
- 跨模块/状态变更必须有图示；单模块小变更可文字说明并给理由。

## Evidence / Decision / Assumption

- 文件/模块影响必须来自 repository evidence（EV-REPO），不得凭空推测。
- 关键实现取舍写 DEC；风险写 RISK。
- 仓内不可确认的行为标 ASM 并发起确认。

## 质量门禁

对应 `docs/governance/design-quality-gates.md`：
- `QG-TPL-001/002`（design-template-check）
- `QG-ID-002/003/006/009`、`QG-DIA-001`、`QG-RISK-002`（design-quality-gate --target implementation-design）

> 由 `design-template-check` 与 `design-quality-gate --target implementation-design` 执行；产出 `quality-gates/TPL-*.json` 与 `QG-*.json`。

## 失败处理

- solution 缺接口/数据定义 → 退回 solution 或标缺口并确认。
- 代码仓不可读 / 查询失败 → 记录缺口为 assumption，发起人工确认，不臆测实现。
- 发现 solution 方案不可实现 → 记录 RISK，退回 solution。
- 实现风险过高且无缓解 → 停止，输出风险清单 + 候选方案，人工裁决。

## 修订模式（`--mode revise`）

1. 在 implementation decisions 记录原因。
2. 分析对 testDesign 与已实现代码（若已进入实现）的影响。
3. 递增 version，重置 testDesign 为 `drafted`，标记重新评审。

## 下游交接契约

- **给 feature-review**：ready-for-review + artifactId / version。
- **给 DEV（implementation-plan）**：文件影响、类/函数签名、迁移/回滚、测试钩子——可直接派生实现任务。
- **给 test-design**：实现风险、状态机、错误路径、测试钩子。

## 完成标准

- 文件/模块影响全部来自 repository evidence。
- 关键流程有时序图；状态/数据变更有图。
- 错误处理/并发/事务/幂等/回滚策略齐全（高风险项）。
- DEV 能直接派生 implementation-plan；TSE 能派生实现风险测试。
- 与 solution 接口契约无冲突。

## 禁止事项

- 不写实际源代码（本阶段是设计，不是实现）。
- 不复制大段源码到 evidence（只记路径/符号/调用关系）。
- 不凭空推测代码仓结构。
- 不改其他阶段产物与 `state.json`。
