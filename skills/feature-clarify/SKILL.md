---
name: feature-clarify
description: 在主会话中以用户确认和知识证据为基础澄清 feature 需求；知识查询始终由一次性子 Agent 完成。
---

# Feature Clarify — 需求澄清

在主会话中完成需求澄清、提问和确认。此 skill **MUST NOT directly query the knowledge base in the main session**。初始查询与每次重查都 **MUST dispatch a one-shot `knowledge-query` subagent**；主会话 **MUST wait for the structured EV/gap result** 后才可继续。每次派发均是新的、一次性子 Agent：**MUST NOT reuse agent IDs**，**MUST NOT use teammate**，也不得跨轮恢复该子 Agent。

## 集成契约

- **入口:** `/scc-dev-sphere:feature-clarify`
- **前置状态:** `state.status` 必须为 `initialized`
- **读取:** `state.json`（含 `clarification`，若存在）、`inputs/requirement.md`、`evidence/evidence-registry.json` 和采用的 `evidence/knowledge/EV-*.md`
- **输出:** `state.clarification` 中的用户确认结论、更新后的 `inputs/requirement.md`、已记录的证据缺口
- **完成标准:** `validateClarification` 通过且用户最终确认，然后执行 `set-task-status <workspaceRoot> clarified`

## 执行步骤

### 步骤1：加载或初始化澄清状态

读取任务状态；若 `status !== 'initialized'`，停止并提示从 workflow 获取下一合法动作。读取原始需求和已有 `state.clarification`；不存在时调用 `createClarification(originalRequirement)` 并写入 `state.clarification`。恢复执行时还必须读取 `evidence/evidence-registry.json` 与采用的 `evidence/knowledge/EV-*.md`，恢复 EV、gap、已确认事实和历史。**Only re-ask incomplete or affected dimensions**：后续反馈只会影响相关维度或技术契约，未受影响的已确认项不得重复提问。不得把模型推测或知识库内容写成结论。

### 步骤2：获取初始知识证据

根据原始需求构造查询意图（涉及的业务规则、系统/模块、接口、数据、权限、性能、部署等）。**MUST dispatch a one-shot `knowledge-query` subagent**，其 prompt 必须要求返回结构化 `EV/gap` 结果。**MUST wait for the structured EV/gap result**，确认每个采用的事实都有 `evidence/knowledge/EV-*.md` 快照和 `evidence/evidence-registry.json` 条目；将每项 gap 通过 `recordEvidenceGap` 写入 clarification，保留完整的 `status`、`reliability` 和 `userResolution`（如有）。事实只能作为待用户确认的候选依据。

### 步骤3：确认需求类型

基于原始需求与 EV/gap 结果，推荐 `functional`、`technical` 或 `mixed`，说明推荐理由。使用 AskUserQuestion 的 `single_select`，提供 2–3 个选项，推荐项置首并标记 `(Recommended)`；每个选项的说明必须带来源标签，例如 `[knowledge: EV-001]`、`[inference: 原始描述]` 或 `[user: 原始输入]`。

用户确认后，才以 `recordConclusion(clarification, 'requirementType', selected, sourcesIncludingUser, confirmedAt)` 持久化。**Only persist user-confirmed conclusions**；选择 Other 时先澄清其含义再记录。

### 步骤4：逐维度澄清

按顺序询问 `businessGoal`、`usersAndScenarios`、`functionalScope`、`nonGoalsAndBoundaries`、`acceptanceCriteria`、`constraintsAndRisks`。**Ask one requirement dimension at a time**：展示当前维度的候选结论、相关 EV、推断和 gaps，再只问该维度的一个问题。用户确认后才调用 `recordConclusion`，sources 必须同时保留知识/推断依据（如有）和 `{ kind: 'user' }`。

`functional` 需求（例如背景图片自定义）**MUST NOT** 追问与用户价值、风险或验收无关的 API、protocol 或其他技术实现契约。对于 `technical` 或 `mixed`，先维护发现的技术影响清单：每项必须以 `recordTechnicalImpactDecision` 明确标为 `applicable`（关联一个已确认契约）或 `not_applicable`（附用户确认的理由）。空清单仅可通过 `confirmNoTechnicalImpacts` 的用户确认放行。每个适用契约及子字段都必须有非歧义 `conclusion`、有效 `sources`（包含 user）和 `confirmedAt`。northbound API（北向 API）至少将 `apiUrl`、`protocol`、`requestResponse` 和 `performance` 分别写入 `technicalContracts`；任何一个未确认都不得放行。使用 `recordTechnicalConclusion` 记录这些结论。数据、权限、部署等其余实际受影响的契约同样必须确认。不适用项应明确记录为不适用，不得替用户假定技术约束。

### 步骤5：按反馈重查并记录缺口

每次用户反馈后调用 `shouldRequery(feedback)`。结果为 true 时，**MUST dispatch a one-shot `knowledge-query` subagent**，不得复用此前 agent ID；**MUST wait for the structured EV/gap result**。将新 gap 用 `recordEvidenceGap` 保存，并将新 EV 仅作为下一次单维度提问的候选依据。结果为 false 时继续下一个尚未确认维度。

### 步骤6：验证和最终确认

调用 `validateClarification(clarification)`。若未完成，逐个展示缺失项并回到相应的单维度问题；不要绕过验证。通过后用 `renderRequirementMarkdown(clarification)` 更新 `inputs/requirement.md`，展示最终需求类型、所有确认结论、来源和证据缺口。

使用 AskUserQuestion 的 `confirm_gate` 请求最终确认。若 final summary is rejected, return to the affected dimension；保留未受影响的确认结论，修改项仍必须重新确认。只有用户确认最终内容后，调用 `recordFinalConfirmation` 持久化 `finalConfirmedAt`，保存 clarification 与 requirement markdown，并执行：

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js set-task-status <workspaceRoot> clarified
```

若用户要求修改，保留已确认内容，回到所指维度；修改后的结论仍必须由用户重新确认。

## 约束

- 主会话负责用户交互、状态读取、结论持久化和最终状态迁移；知识库查询只能由一次性 `knowledge-query` subagent 执行。
- 每个查询子 Agent 返回后即结束；不得使用 teammate、不得重用 agent ID、不得在主会话直接调用知识库。
- 所有结论都必须带 user source；EV、推断和 gap 不构成用户确认。
- 无法获得知识证据不是阻塞条件：记录 gap，向用户说明不确定性并请求确认。
