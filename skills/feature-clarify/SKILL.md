---
name: feature-clarify
description: 在主会话中以用户确认和知识证据为基础澄清 feature 需求；知识查询始终由一次性子 Agent 完成。用于需求澄清、需求确认、逐维度提问、证据缺口记录。
---

# Feature Clarify — 需求澄清

在主会话完成需求澄清。**MUST NOT directly query the knowledge base in the main session** —— 知识查询只能派发一次性子 Agent 执行（见下）。每次派发都是新的 Task：**MUST NOT reuse agent IDs**，**MUST NOT use teammate**，不跨轮恢复。

## 派发知识查询子 Agent

初始查询与每次重查都 **MUST dispatch a one-shot `knowledge-query` subagent**（一次性子 Agent，承担知识查询任务）。派发方式：

- **工具：** Task（Agent）
- **`subagent_type`：** `"general-purpose"`。**禁止**填 `"scc-dev-sphere:knowledge-query"` —— 那是 skill 名、非注册 agent，会报 `Agent type not found`。
- **`description`：** 简短查询主题（如 `Query knowledge base for blog system`）。
- **`prompt` 必须包含：** ① 查询意图（业务规则/系统模块/接口/数据/权限/性能/部署）② "加载并遵循 `scc-dev-sphere:knowledge-query` skill 执行查询与证据收集" ③ "返回结构化 EV/gap JSON（`facts` + `gaps`，每项 fact 含 evidenceId 与 reliability）" ④ "不得使用 AskUserQuestion；无法确认的一律作为 gap 上报"。
- 每次都是新 Task，不复用、不跨轮恢复、不作 teammate。

派发后 **MUST wait for the structured EV/gap result** 再继续。

## 集成契约

- **入口:** `/scc-dev-sphere:feature-clarify`
- **前置状态:** `state.status === 'initialized'`
- **读取:** `state.json`（含 `clarification`）、`inputs/requirement.md`、`evidence/evidence-registry.json`、采用的 `evidence/knowledge/EV-*.md`
- **完成标准:** `validateClarification` 通过且用户最终确认 → `set-task-status <workspaceRoot> clarified`

## 执行步骤

### 1. 加载或初始化澄清状态

若 `status !== 'initialized'`，停止，提示从 workflow 取下一动作。读取原始需求与已有 `state.clarification`；不存在则 `createClarification(originalRequirement)` 写入。恢复执行时必须读取 `evidence/evidence-registry.json` 与采用的 `evidence/knowledge/EV-*.md`，恢复 EV、gap、已确认事实与历史。**Only re-ask incomplete or affected dimensions**：未受影响的已确认项不重复提问。不得把模型推测或知识库内容写成结论。

### 2. 获取初始知识证据

构造查询意图，**按上节派发一次性子 Agent**。等待结果后，确认每个采用的事实都有 `evidence/knowledge/EV-*.md` 快照和 `evidence/evidence-registry.json` 条目；每项 gap 用 `recordEvidenceGap` 写入 clarification，保留完整的 `status`、`reliability`、`userResolution`（如有）。事实仅作待确认候选。

### 3. 确认需求类型

基于原始需求与 EV/gap，推荐 `functional`/`technical`/`mixed` 并说明理由。AskUserQuestion `single_select`，2–3 选项，推荐项置首标 `(Recommended)`，每个选项说明带来源标签（`[knowledge: EV-001]` / `[inference: …]` / `[user: …]`）。用户确认后以 `recordConclusion(clarification, 'requirementType', selected, sourcesIncludingUser, confirmedAt)` 持久化。**Only persist user-confirmed conclusions**；选 Other 先澄清再记。

### 4. 逐维度澄清

按顺序问 `businessGoal` → `usersAndScenarios` → `functionalScope` → `nonGoalsAndBoundaries` → `acceptanceCriteria` → `constraintsAndRisks`。**Ask one requirement dimension at a time**：展示候选结论/EV/推断/gaps，只问该维度一个问题。用户确认后 `recordConclusion`，sources 同时保留依据（如有）和 `{ kind: 'user' }`。

`functional` 需求 **MUST NOT** 追问与用户价值/风险/验收无关的 API、protocol 或技术契约。`technical`/`mixed`：先维护技术影响清单，每项以 `recordTechnicalImpactDecision` 标为 `applicable`（关联已确认契约）或 `not_applicable`（附用户确认理由）；空清单仅可由 `confirmNoTechnicalImpacts` 用户确认放行。每个适用契约及子字段须有非歧义 `conclusion`、有效 `sources`（含 user）、`confirmedAt`。northbound API 至少将 `apiUrl`、`protocol`、`requestResponse`、`performance` 分别写入 `technicalContracts`，任一未确认不得放行；用 `recordTechnicalConclusion` 记录。数据/权限/部署等其余受影响契约同样须确认；不适用项明确记为不适用，不替用户假定。

### 5. 按反馈重查并记录缺口

每次反馈后调 `shouldRequery(feedback)`：true 则**按上节派发一次性子 Agent**（不复用此前 agent ID），等待结果，新 gap 用 `recordEvidenceGap` 保存，新 EV 仅作下次单维度提问候选；false 则进下一未确认维度。

### 6. 验证和最终确认

调 `validateClarification(clarification)`；未完成则逐项展示缺失并回相应维度，不绕过验证。通过后用 `renderRequirementMarkdown(clarification)` 更新 `inputs/requirement.md`，展示最终需求类型、确认结论、来源与证据缺口。

AskUserQuestion `confirm_gate` 请求最终确认。若 final summary is rejected, return to the affected dimension；保留未受影响项，修改项须重新确认。用户确认后 `recordFinalConfirmation` 持久化 `finalConfirmedAt`，保存 clarification 与 requirement markdown，并执行：

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js set-task-status <workspaceRoot> clarified
```

## 约束

- 所有结论都必须带 user source；EV、推断、gap 不构成用户确认。
- 无法获得知识证据不是阻塞条件：记录 gap，向用户说明不确定性并请求确认。
