---
name: feature-design-implementation
description: 实现设计阶段的专业方法论。主会话按 inspect 的 run_stage.activity 调用 analyze/discover/design/revise，产出到 work/implementation-design/。不写 artifacts（由 publish 发布）、不写 state/reviews、不自行询问用户。
---

# Feature Design — 实现设计

模块级详细设计阶段的领域方法论 Skill。主会话按 `inspect` 返回的 `run_stage.activity` 调用本 skill 的对应活动，产出写入 `work/implementation-design/`，最终 draft 经 Gate/Review/Baseline 发布为 `artifacts/implementation-design.md`。

本 skill 不携带 MDE Agent 身份，不读取 workflow mode，不自行 `AskUserQuestion`——发现需用户判断的事项时写 pending decision。

## 集成契约

- **入口:** 由 `feature-design` skill 在 `run_stage`（stage=`implementationDesign`）动作中加载，按 activity 执行。
- **activity 入参:** `analyze | discover | design | revise`（revise 附 revision items 来源）。
- **读取:** `artifacts/solution-design.md`（上游已 Baseline）、`artifacts/business-design.md`、`decisions/solution-design-decisions.json`、`templates/artifacts/implementation-design.md`、`evidence/`、`decisions/implementation-design-decisions.json`。
- **允许写入:** `work/implementation-design/{analysis,discovery,design,draft}.md`、`evidence/repository/EV-REPO-*` 与 registry、`decisions/implementation-design-decisions.json`。
- **禁止写入:** `artifacts/`、`state.json`、`reviews/`、`approvals/`、`quality-gates/`、其他阶段 work 目录、**源代码**（本阶段只设计，不写代码）。
- **用户决策:** 发现需用户判断时写 pending decision（`node scripts/devsphere-decisions.js add <taskPath> implementation-design <json>`），不自行 `AskUserQuestion`。主会话在 `ask_decision` 动作统一询问。
- **完成信号:** 每个 activity 完成后由主会话调 `mark-ready <taskPath> implementationDesign <analysis|discovery|design>`。

## Analyze（产出 `work/implementation-design/analysis.md`）

目标：理解方案输入与代码影响面，形成调查计划。

关注点：

1. 解析上游 `artifacts/solution-design.md` 的接口契约、数据模型、NFR、风险、模块边界。
2. 识别实现目标、约束、非目标；对齐 solution 接口/数据。
3. 识别代码影响面缺口（模块结构、文件路径、关键符号、既有调用链、既有实现模式）。
4. 分类「可调查事实」（仓内可查）与「必须用户确认」（取舍/方案选择）。
5. 形成调查清单（受影响模块、调用链、实现模式）。

`analysis.md` 包含：阶段目标、上游输入摘要、初步理解、范围/边界、待调查问题、待用户确认事项、调查计划。

完成后由主会话调 `mark-ready <taskPath> implementationDesign analysis`。

## Discover（产出 `work/implementation-design/discovery.md` + repository evidence + decisions）

目标：实际查询代码仓，绑定到具体路径/符号，综合为实现设计输入。

调查项：

1. **查询代码仓影响面：** 模块结构、文件路径、关键符号、既有调用链、既有实现模式。
2. **保存 repository evidence：** 只记录路径、符号、调用关系——**不复制大段源码**；登记为 `evidence/repository/EV-REPO-*` 并写入 `evidence-registry.json`。
3. 识别冲突/缺失/不确定结论——仓内不可确认的行为标 ASM 并发起确认。
4. 将关键实现取舍记 pending decision（如多个实现方案、外部依赖升级、不可逆结构变化）。
5. 综合为正式设计输入摘要。

`discovery.md` 包含：调查项与查询范围、关键发现、repository evidence 引用、现状约束、冲突/未知项、对设计的影响。原始事实放 `evidence/`，不复制大段源码。

完成后由主会话调 `mark-ready <taskPath> implementationDesign discovery`。

## Design（产出 `work/implementation-design/design.md` + `work/implementation-design/draft.md`）

### design.md（设计推演）

保存候选实现方案、模块职责划分推演、关键调用链分析、被拒绝方案、与 repository evidence/decision 关联。

### draft.md（正式候选）

完整符合 `templates/artifacts/implementation-design.md`，frontmatter 含 `artifactId` + `version`（本轮修订不递增，由 hash 使旧 Gate/Review 失效）。

专业方法论（迁入此处）：

- **模块职责与文件影响：** 文件 / 变更类型 / owner，表格呈现。
- **签名设计：** 类 / 接口 / 函数签名，DTO / VO / Entity / 配置对象。
- **时序图：** Mermaid `sequenceDiagram`，覆盖关键流程的主要调用链与失败路径。
- **数据流图：** `flowchart`；状态机：`stateDiagram-v2`（与 solution 一致）。
- **算法/规则实现：** BR 可追溯。
- **API 适配：** 与 solution 接口契约对齐。
- **数据库/配置变更：** 迁移 / 回滚脚本或步骤。
- **错误处理 / 并发与事务 / 幂等性：** 高风险项不可空。
- **性能 / 安全 / 兼容要点：** 对齐 solution NFR。
- **日志 / 监控 / 指标：** 与可观测性要求对齐。
- **测试钩子（test seam）：** 支撑可测试性。
- **回滚策略：** 回滚、降级、残余风险、owner。
- **实现风险：** RISK ID 到 `decisions/implementation-design-decisions.json`，影响、缓解、owner。

Evidence/Decision/Assumption 使用要求：

- 文件 / 模块影响必须来自 repository evidence（EV-REPO），**不得凭空推测**。
- 关键实现取舍写 DEC；风险写 RISK。
- 仓内不可确认的行为标 ASM 并发起确认。

Draft 完成后由主会话触发 Gate；本 skill 不自行调用 Gate 或推进 Review。

## Revise（更新 `design.md` + `draft.md`）

修订触发由主会话 `inspect` 返回：Gate fail、Review blocking、advisory apply、risk_candidate 需修改、用户拒绝、上游 solution Baseline 变更重开。

修订活动：

1. 读取全部 revision items。
2. 必要时回 Analyze/Discover 补充（如发现新代码影响）。
3. 在 `design.md` 记录推演；在 `decisions/implementation-design-decisions.json` 记录关键修订 decision。
4. 更新 `draft.md`——不跳 Gate；本轮不递增 version；draft hash 改变使旧 Gate/Review 失效。
5. 重新进入 Validate。

实现设计修订时应重查的内容：

- 文件 / 模块影响是否仍与 repository evidence 一致（仓可能已变）。
- 时序图 / 状态机是否与修订后的接口对齐。
- 错误处理 / 并发 / 事务 / 幂等 / 回滚策略是否仍齐全。
- 与 solution 接口契约无冲突。
- 测试钩子是否仍有效。

## 完成标准

- `analysis.md`：实现目标、待调查问题、待用户确认事项明确。
- `discovery.md`：代码仓调查项有 EV-REPO 引用；关键取舍已转 pending decision 或 DEC；无凭空推测。
- `design.md`：候选方案与取舍推演可追溯至 EV-REPO/DEC。
- `draft.md`：完整符合 Artifact 模板，无占位符；文件/模块影响全部来自 repository evidence；关键流程有时序图；状态/数据变更有图；错误处理/并发/事务/幂等/回滚策略齐全（高风险项）；与 solution 接口契约无冲突；DEV 能直接派生 implementation-plan；TSE 能派生实现风险测试。

## Context pointers

- Artifact 模板: `templates/artifacts/implementation-design.md`
- Gate catalog: `docs/governance/design-quality-gates.md`（`QG-TPL-001/002`、`QG-ID-002/003/006/009`、`QG-DIA-001`、`QG-RISK-002`）
- 上游 artifact: `artifacts/solution-design.md`（必要）、`artifacts/business-design.md`（参考）
- 下游消费者: DEV `feature-plan-implementation`（文件影响、类/函数签名、迁移/回滚、测试钩子）、`feature-design-test`（实现风险、状态机、错误路径、测试钩子）。
