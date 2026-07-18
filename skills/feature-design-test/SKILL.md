---
name: feature-design-test
description: 测试设计阶段的专业方法论。主会话按 inspect 的 run_stage.activity 调用 analyze/discover/design/revise，产出到 work/test-design/。不写 artifacts（由 publish 发布）、不写 state/reviews、不自行询问用户。
---

# Feature Design — 测试设计

风险驱动测试设计阶段的领域方法论 Skill。主会话按 `inspect` 返回的 `run_stage.activity` 调用本 skill 的对应活动，产出写入 `work/test-design/`，最终 draft 经 Gate/Review/Baseline 发布为 `artifacts/test-design.md`。

本 skill 不携带 TSE Agent 身份，不读取 workflow mode，不调用 `devsphere-teammate-conduct`，不自行 `AskUserQuestion`——发现需用户判断的事项时写 pending decision。

## 集成契约

- **入口:** 由 `feature-design` skill 在 `run_stage`（stage=`testDesign`）动作中加载，按 activity 执行。
- **activity 入参:** `analyze | discover | design | revise`（revise 附 revision items 来源）。
- **读取:** `artifacts/business-design.md`、`artifacts/solution-design.md`、`artifacts/implementation-design.md`（三者均已 Baseline）、各阶段 decisions、`templates/artifacts/test-design.md`、`evidence/`、`decisions/test-design-decisions.json`。
- **允许写入:** `work/test-design/{analysis,discovery,design,draft}.md`、`evidence/`、`decisions/test-design-decisions.json`。
- **禁止写入:** `artifacts/`、`state.json`、`reviews/`、`approvals/`、`quality-gates/`、其他阶段 work 目录。
- **用户决策:** 发现需用户判断时写 pending decision（`node scripts/devsphere-decisions.js add <taskPath> test-design <json>`），不自行 `AskUserQuestion`。主会话在 `ask_decision` 动作统一询问。
- **完成信号:** 每个 activity 完成后由主会话调 `mark-ready <taskPath> testDesign <analysis|discovery|design>`。

## Analyze（产出 `work/test-design/analysis.md`）

目标：理解三类上游设计的风险面，形成调查计划。

关注点：

1. 解析 business（业务规则 / 验收标准）、solution（接口契约 / 质量属性 / 风险）、implementation（状态机 / 错误路径 / 测试钩子 / 风险）。
2. 识别测试目标、范围（测什么 / 不测什么）。
3. 识别信息缺口（历史缺陷、测试规范、测试环境约束）。
4. 分类「可调查事实」与「必须用户确认」（如接受不可测项、缩减范围）。
5. 形成调查清单（历史缺陷、回归基线、测试规范、环境约束）。

`analysis.md` 包含：阶段目标、上游输入摘要、初步理解、范围/边界、待调查问题、待用户确认事项、调查计划。

完成后由主会话调 `mark-ready <taskPath> testDesign analysis`。

## Discover（产出 `work/test-design/discovery.md` + evidence + decisions）

目标：收集历史缺陷、测试规范、环境约束，综合为测试设计输入。

调查项：

1. 经 `knowledge-query` 查询历史缺陷、回归基线、测试规范、测试环境约束；将实际采用的事实保存为 `evidence/knowledge/EV-*` 并登记到 registry。
2. 识别证据冲突 / 缺失——不可确认的回归范围标 ASM。
3. 将需要取舍的问题（接受不可测项、缩减范围、接受 risk_candidate）记 pending decision。
4. 综合为正式测试设计输入摘要。

`discovery.md` 包含：调查项与查询范围、关键发现、evidence 引用、现状约束、冲突/未知项、对设计的影响。

完成后由主会话调 `mark-ready <taskPath> testDesign discovery`。

## Design（产出 `work/test-design/design.md` + `work/test-design/draft.md`）

### design.md（设计推演）

保存测试策略推演、金字塔比例取舍、被拒绝方案、与 evidence/decision 关联。

### draft.md（正式候选）

完整符合 `templates/artifacts/test-design.md`，frontmatter 含 `artifactId` + `version`（本轮修订不递增，由 hash 使旧 Gate/Review 失效）。

专业方法论（迁入此处）：

- **风险驱动追溯：** 业务规则、架构风险、实现风险 → TEST，明确每类测试在防什么风险；表格 `REQ/BR/API/MOD/RISK → TEST`，无关键孤儿。
- **测试目标与范围：** 测什么 / 不测什么，对齐三类上游。
- **测试金字塔：** unit / contract / integration / e2e 比例与理由；非仅 E2E/人工；表格或图标注。
- **测试类型设计：**
  - unit
  - 接口契约测试（request / error / auth / compat）
  - integration
  - e2e
  - regression
  - boundary / negative / permission / security / performance / compatibility
- **测试场景表：** ID / 前置 / 步骤 / 预期。
- **测试数据 / 测试环境 / Mock / Stub：** 明确来源与约束。
- **回归范围：** 引用 `evidence/` 或缺陷 ID，避免只靠 E2E。
- **自动化建议：** 测试类型 / 命令 / owner，可进入 DEV plan。
- **不可测项：** 原因、影响、缓解、owner；高风险不可测项转 gated pending decision（**不得自动变 accepted_risk**）。
- **风险接受候选：** 不得自动变为 accepted_risk，必须经用户决定。
- **转测准入标准：** 可检查 checklist，可执行。

Evidence/Decision/Assumption 使用要求：

- 回归范围、缺陷引用必须有 EV 或缺陷 ID。
- 测试策略取舍（如缩减范围）写 DEC。
- 不可测项必须有原因 + 缓解；高风险不可测项转 gated pending decision。

Draft 完成后由主会话触发 Gate；本 skill 不自行调用 Gate 或推进 Review。

## Revise（更新 `design.md` + `draft.md`）

修订触发由主会话 `inspect` 返回：Gate fail、Review blocking、advisory apply、risk_candidate 需修改、用户拒绝、上游任一 Baseline 变更重开。

修订活动：

1. 读取全部 revision items。
2. 必要时回 Analyze/Discover 补充（如新缺陷证据）。
3. 在 `design.md` 记录推演；在 `decisions/test-design-decisions.json` 记录关键修订 decision。
4. 更新 `draft.md`——不跳 Gate；本轮不递增 version；draft hash 改变使旧 Gate/Review 失效。
5. 重新进入 Validate。

测试设计修订时应重查的内容：

- 风险驱动追溯矩阵是否仍无关键孤儿（上游风险可能新增）。
- 测试金字塔比例是否仍合理。
- 不可测项 / risk_candidate 是否仍有效。
- 回归范围引用是否仍成立。
- 转测准入 checklist 是否仍可执行。

## 完成标准

- `analysis.md`：测试目标、范围、待调查问题、待用户确认事项明确。
- `discovery.md`：历史缺陷/测试规范调查项有 EV 引用；不可确认的回归范围标 ASM；关键取舍转 pending decision 或 DEC。
- `design.md`：测试策略推演可追溯。
- `draft.md`：完整符合 Artifact 模板，无占位符；关键业务规则和高风险项在追溯矩阵中无孤儿；测试金字塔层级明确，非仅 E2E/人工；不可测项有原因 + 缓解，高风险项经人工确认；回归范围引用 evidence/缺陷；转测准入标准可执行（checklist）。

## Context pointers

- Artifact 模板: `templates/artifacts/test-design.md`
- Gate catalog: `docs/governance/design-quality-gates.md`（`QG-TPL-001/002`、`QG-TD-002/003/004/007`、`QG-TR-003`、`QG-RISK-003`）
- 上游 artifact: `artifacts/business-design.md`、`artifacts/solution-design.md`、`artifacts/implementation-design.md`
- 下游消费者: `feature-verify`（test-handoff：转测准入 checklist、测试场景、测试数据/环境需求、自动化建议）、DEV `feature-plan-implementation`（自动化测试任务：类型/命令/owner）。
