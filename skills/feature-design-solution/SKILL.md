---
name: feature-design-solution
description: 方案设计阶段的专业方法论。主会话按 inspect 的 run_stage.activity 调用 analyze/discover/design/revise，产出到 work/solution-design/。不写 artifacts（由 publish 发布）、不写 state/reviews、不自行询问用户。
---

# Feature Design — 方案设计

方案与架构设计阶段的领域方法论 Skill。主会话按 `inspect` 返回的 `run_stage.activity` 调用本 skill 的对应活动，产出写入 `work/solution-design/`，最终 draft 经 Gate/Review/Baseline 发布为 `artifacts/solution-design.md`。

本 skill 不携带 SE Agent 身份，不读取 workflow mode，不调用 `devsphere-teammate-conduct`，不自行 `AskUserQuestion`——发现需用户判断的事项时写 pending decision。

## 集成契约

- **入口:** 由 `feature-design` skill 在 `run_stage`（stage=`solutionDesign`）动作中加载，按 activity 执行。
- **activity 入参:** `analyze | discover | design | revise`（revise 附 revision items 来源）。
- **读取:** `artifacts/business-design.md`（上游已 Baseline）、`decisions/business-design-decisions.json`、`templates/artifacts/solution-design.md`、`evidence/`、`decisions/solution-design-decisions.json`。
- **允许写入:** `work/solution-design/{analysis,discovery,design,draft}.md`、`evidence/`、`decisions/solution-design-decisions.json`。
- **禁止写入:** `artifacts/`、`state.json`、`reviews/`、`approvals/`、`quality-gates/`、其他阶段 work 目录、`work/business-design/*`。
- **用户决策:** 发现需用户判断时写 pending decision（`node scripts/devsphere-decisions.js add <taskPath> solution-design <json>`），不自行 `AskUserQuestion`。主会话在 `ask_decision` 动作统一询问。
- **完成信号:** 每个 activity 完成后由主会话调 `mark-ready <taskPath> solutionDesign <analysis|discovery|design>`。

## Analyze（产出 `work/solution-design/analysis.md`）

目标：理解业务输入、架构目标和约束，形成调查计划。

关注点：

1. 解析上游 `artifacts/business-design.md` 的业务目标、业务规则、状态模型、验收标准、assumption。
2. 识别架构目标、约束、非目标；对齐 REQ/BR/NFR。
3. 识别架构信息缺口（领域规范、现有架构、接口契约、数据模型、部署约束）。
4. 分类「可调查事实」与「必须用户确认」。
5. 判断哪些信息可从架构规范（`knowledge-query`）或上游设计获得。
6. 形成调查清单（受影响架构、存量接口/数据、规范约束）。

`analysis.md` 包含：阶段目标、上游输入摘要、初步理解、范围/边界、待调查问题、待用户确认事项、调查计划。

完成后由主会话调 `mark-ready <taskPath> solutionDesign analysis`。

## Discover（产出 `work/solution-design/discovery.md` + evidence + decisions）

目标：收集架构事实，综合为正式设计输入。

调查项：

1. 经 `knowledge-query` 查询架构规范、现有接口契约、数据模型、部署约束；将实际采用的事实保存为 `evidence/knowledge/EV-*` 并登记到 registry。
2. 识别证据冲突、缺失、不确定结论——未经证明的前提标 ASM。
3. 将架构取舍记 pending decision（gated / autonomous 由主会话策略决定）。
4. 综合为正式设计输入摘要。

`discovery.md` 包含：调查项与查询范围、关键发现、evidence 引用、现状约束、冲突/未知项、对设计的影响。

完成后由主会话调 `mark-ready <taskPath> solutionDesign discovery`。

## Design（产出 `work/solution-design/design.md` + `work/solution-design/draft.md`）

### design.md（设计推演）

保存候选方案、C4 视图草稿、4+1 覆盖推演、取舍、被拒绝方案、与 evidence/decision 关联。

### draft.md（正式候选）

完整符合 `templates/artifacts/solution-design.md`，frontmatter 含 `artifactId` + `version`（本轮修订不递增，由 hash 使旧 Gate/Review 失效）。

专业方法论（迁入此处）：

- **架构目标与约束：** 目标、约束、非目标，对齐 business REQ/BR/NFR。
- **需求到架构追溯：** REQ/BR → ARCH/API/MOD，无关键孤儿规则。
- **C4 视图：** Context → Container → Component，按需下钻；层级不混；用 `flowchart` 或 C4-like 表达；每张图后附说明。
- **4+1 视图覆盖矩阵：** logical/development/process/physical/scenario 表格；中高风险必须覆盖受影响视图；scenario 用 `sequenceDiagram`，physical 用 deployment 图。
- **系统/模块边界：** 边界、依赖方向。
- **接口契约：** request/response/error/auth/version/兼容性；表格或 OpenAPI/AsyncAPI 引用。
- **数据模型/数据流：** ER 图 / 数据流图；所有权、迁移、回滚。
- **集成：** 同步/异步、超时、重试、幂等。
- **质量属性（NFR）：** 场景化表达（source/stimulus/environment/response/measure），可验证。
- **轻量 ATAM：** 候选方案、敏感点、trade-off、风险。
- **安全 STRIDE：** 涉权 / PII / 外部输入。
- **架构决策：** DEC ID 到 `decisions/solution-design-decisions.json`；架构风险 RISK ID（影响、缓解、owner）。
- **CIE 触发：** 若涉及部署/配置/迁移/数据变更，标记触发 CIE。

Evidence/Decision/Assumption 使用要求：

- 接口契约、系统边界声明必须可追溯至 EV 或 DEC。
- 关键架构取舍写 DEC；风险写 RISK。
- 无证据前提标 ASM；高风险 ASM 转 gated pending decision。

Draft 完成后由主会话触发 Gate；本 skill 不自行调用 Gate 或推进 Review。

## Revise（更新 `design.md` + `draft.md`）

修订触发由主会话 `inspect` 返回：Gate fail、Review blocking、advisory apply、risk_candidate 需修改、用户拒绝、上游 business Baseline 变更重开。

修订活动：

1. 读取全部 revision items（统一汇总）。
2. 必要时回 Analyze/Discover 补充。
3. 在 `design.md` 记录推演；在 `decisions/solution-design-decisions.json` 记录关键修订 decision。
4. 更新 `draft.md`——不跳 Gate；本轮不递增 version；draft hash 改变使旧 Gate/Review 失效。
5. 重新进入 Validate。

方案设计修订时应重查的内容：

- C4/4+1 视图是否与修订后的边界一致。
- 接口契约/数据模型是否仍满足 business 验收标准。
- NFR 场景是否仍可验证。
- 风险 owner 是否仍有效。
- 下游（implementation/test）交接字段是否仍完整。
- CIE 触发标记是否仍正确。

## 完成标准

- `analysis.md`：架构目标、约束、待调查问题、待用户确认事项明确。
- `discovery.md`：架构事实有 EV 引用；关键取舍已转 pending decision 或 DEC。
- `design.md`：候选方案与取舍推演可追溯。
- `draft.md`：完整符合 Artifact 模板，无占位符；业务规则被方案承接（无关键缺口）；接口、数据、NFR、风险可被实现和测试；关键取舍有 DEC ID；风险有 owner；C4/4+1 按风险覆盖；图后说明完整；涉及部署/迁移时已标记触发 CIE。

## Context pointers

- Artifact 模板: `templates/artifacts/solution-design.md`
- Gate catalog: `docs/governance/design-quality-gates.md`（`QG-TPL-001/002`、`QG-SD-002/003/004`、`QG-API-001`、`QG-DATA-001`、`QG-NFR-001`、`QG-SEC-001`、`QG-DEC-001`、`QG-RISK-001`）
- 上游 artifact: `artifacts/business-design.md`
- 下游消费者: `feature-design-implementation`（模块边界、接口契约、数据模型、NFR、风险）、`feature-design-test`（接口契约、质量属性场景、风险）、CIE（条件触发：部署/配置/迁移/数据变更项）。
