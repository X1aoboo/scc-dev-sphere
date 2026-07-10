---
name: feature-clarify
description: 在主会话中以用户确认和知识证据为基础、按歧义挖掘策略逐条澄清 feature 需求；知识查询始终由一次性子 Agent 完成。用于需求澄清、需求确认、歧义挖掘、逐条提问、证据缺口记录。
---

# Feature Clarify — 需求澄清

在主会话完成需求澄清。**MUST NOT directly query the knowledge base in the main session** —— 知识查询只能派发一次性子 Agent 执行（见下）。每次派发都是新的 Task：**MUST NOT reuse agent IDs**，**MUST NOT use teammate**，不跨轮恢复。

## 派发知识查询子 Agent

初始查询、循环内按需查询与每次重查都 **MUST dispatch a one-shot `knowledge-query` subagent**（一次性子 Agent，承担知识查询任务）。派发方式：

- **工具：** Task（Agent）
- **`subagent_type`：** `"general-purpose"`。**禁止**填 `"scc-dev-sphere:knowledge-query"` —— 那是 skill 名、非注册 agent，会报 `Agent type not found`。
- **`description`：** 简短查询主题（如 `Query knowledge base for blog system`）。
- **`prompt` 必须包含：** ① 查询意图（业务规则/系统模块/接口/数据/权限/性能/部署）② "加载并遵循 `scc-dev-sphere:knowledge-query` skill 执行查询与证据收集" ③ "返回结构化 EV/gap JSON（`facts` + `gaps`，每项 fact 含 evidenceId 与 reliability）" ④ "不得使用 AskUserQuestion；无法确认的一律作为 gap 上报"。
- 每次都是新 Task，不复用、不跨轮恢复、不作 teammate。

派发后 **MUST wait for the structured EV/gap result** 再继续。

## 歧义挖掘策略

澄清以**歧义驱动**，而非按固定维度顺序机械提问。六项固定维度（`businessGoal` / `usersAndScenarios` / `functionalScope` / `nonGoalsAndBoundaries` / `acceptanceCriteria` / `constraintsAndRisks`）是**记录落点与完整性闸门**；提问由下列策略驱动。

### 拆解 Decompose
读取原始需求与初始 EV/gap 后，把需求拆成一组**具体需求点**（运行期推理，不落盘）。一个"点" = 一个用户可见能力 / 一条业务规则 / 一个约束 / 一个交互。例："用户可以上传背景图片" 是一个点；"上传后立即生效" 是另一个点。

### 挖歧义 Mine
对每个点逐条扫描以下六类模糊，命中即产出一条**待澄清歧义**：

- **模糊量词/程度**：「快速/大量/友好/一般」无指标。
- **未定义术语**：业务/领域名词无明确含义。
- **隐含假设**：未声明的前置/环境/权限/时序。
- **缺失分支**：只有成功路径，缺失败/回滚/空/并发/边界。
- **可选 vs 必选**：「应该支持/可以」模糊。
- **冲突/依赖**：与其它点矛盾或依赖未澄清的点。

### 映射 Map
每条歧义映射到记录维度：用户行为/边界/规则 → `functionalScope` / `nonGoalsAndBoundaries`；成功/失败/边界的可验收结果 → `acceptanceCriteria`；隐含环境/时序/依赖假设、风险 → `constraintsAndRisks`；接口/协议/数据/部署契约 → 技术契约（仅 technical/mixed）；业务目标 → `businessGoal`；用户场景 → `usersAndScenarios`。

### 逐条问 Ask
**Ask one mined ambiguity at a time.** 每个问题必须含：① 推荐结论 ② 推荐理由 ③ 2–3 个候选 ④ 每个候选与推荐的来源标注（`[knowledge: EV-001]` / `[inference: …]` / `[user: …]`）。每条歧义映射到单一维度，因此仍是 **one requirement dimension at a time**。用户确认后 `recordConclusion` 到映射维度。**Only persist user-confirmed conclusions**；候选推断保留在澄清记录中，不伪装为最终事实。

### 循环 Loop
每轮用户反馈后：`shouldRequery(feedback)` 为真 → 先派发一次性子 Agent；用新事实 + 新 gap 重新拆解/重新挖歧义（答案可能引入新点、消除旧点、暴露新依赖）；继续逐条问。**停止条件**：再挖不出新歧义 **且** `validateClarification` 六维度 + 适用技术契约全部确认（最终确认由第 5 步单独完成，不在本循环内）。

## 集成契约

- **入口:** `/scc-dev-sphere:feature-clarify`
- **前置状态:** `state.status === 'initialized'`
- **读取:** `state.json`（含 `clarification`）、`inputs/requirement.md`、`evidence/evidence-registry.json`、采用的 `evidence/knowledge/EV-*.md`
- **完成标准:** `validateClarification` 通过且用户最终确认 → `set-task-status <workspaceRoot> clarified`

## 执行步骤

### 1. 加载或初始化澄清状态

若 `status !== 'initialized'`，停止，提示从 workflow 取下一动作。读取原始需求与已有 `state.clarification`；不存在则 `createClarification(originalRequirement)` 写入。恢复执行时必须读取 `evidence/evidence-registry.json` 与采用的 `evidence/knowledge/EV-*.md`，恢复 EV、gap、已确认事实与历史。**Only re-ask incomplete or affected dimensions**：未受影响的已确认项不重复提问；恢复后重新拆解需求点，只继续未完成或受影响维度的挖掘。不得把模型推测或知识库内容写成结论。

### 2. 获取初始知识证据

构造查询意图，**按上节派发一次性子 Agent**。等待结果后，确认每个采用的事实都有 `evidence/knowledge/EV-*.md` 快照和 `evidence/evidence-registry.json` 条目；每项 gap 用 `recordEvidenceGap` 写入 clarification，保留完整的 `status`、`reliability`、`userResolution`（如有）。事实仅作待确认候选。

### 3. 确认需求类型

基于原始需求与 EV/gap，推荐 `functional`/`technical`/`mixed` 并说明理由。AskUserQuestion `single_select`，2–3 选项，推荐项置首标 `(Recommended)`，每个选项说明带来源标签（`[knowledge: EV-001]` / `[inference: …]` / `[user: …]`）。用户确认后以 `recordConclusion(clarification, 'requirementType', selected, sourcesIncludingUser, confirmedAt)` 持久化。选 Other 先澄清再记。

### 4. 歧义挖掘循环

按「歧义挖掘策略」驱动提问（替换原固定顺序遍历）：

1. `decompose(原始需求 + EV/gap)` → 需求点；对每点按六类分类法 `mine` → 待澄清歧义列表。
2. 取下一条歧义（**一次一个**）。若该歧义涉及业务规则/系统/模块/接口/数据/权限/性能/部署且**无现存 EV 覆盖**，**MUST 先派发一次性 `knowledge-query` 子 Agent**（推荐前查），等待 EV/gap 并记录。
3. `map` → 维度或技术契约；AskUserQuestion 带推荐结论 + 理由 + 候选 + 来源标注；用户确认后 `recordConclusion`（技术契约用 `recordTechnicalConclusion`）。
4. 每次反馈后调 `shouldRequery(feedback)`：true 则**按上节派发一次性子 Agent**（不复用此前 agent ID），等待结果，新 gap 用 `recordEvidenceGap` 保存，新 EV 仅作下次候选；false 则进下一条。
5. `re-mine(已确认事实)` 追加新歧义（答案可能引入新点、消旧点、暴露依赖）；回到第 2 步。
6. 循环到再挖不出新歧义 **且** `validateClarification` 通过。

`functional` 需求 **MUST NOT** 追问与用户价值/风险/验收无关的 API、protocol 或技术契约——挖掘聚焦分类法中的缺失分支 / 可选 vs 必选 / 隐含假设。`technical`/`mixed`：先维护技术影响清单，每项以 `recordTechnicalImpactDecision` 标为 `applicable`（关联已确认 contract）或 `not_applicable`（附用户确认理由）；空清单仅可由 `confirmNoTechnicalImpacts` 用户确认放行。每个适用 contract 及子字段须有非歧义 conclusion、有效 sources（含 user）、confirmedAt。northbound API 至少将 `apiUrl`、`protocol`、`requestResponse`、`performance` 分别写入 `technicalContracts`，任一未确认不得放行；用 `recordTechnicalConclusion` 记录。数据/权限/部署等其余受影响 contract 同样须确认；不适用项明确记为不适用，不替用户假定。

### 5. 验证和最终确认

调 `validateClarification(clarification)`；未完成则逐项展示缺失并回相应维度，不绕过验证。通过后用 `renderRequirementMarkdown(clarification)` 更新 `inputs/requirement.md`，展示最终需求类型、确认结论、来源与证据缺口。

AskUserQuestion `confirm_gate` 请求最终确认。若 final summary is rejected, return to the affected dimension；保留未受影响项，修改项须重新确认。用户确认后 `recordFinalConfirmation` 持久化 `finalConfirmedAt`，保存 clarification 与 requirement markdown，并执行：

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js set-task-status <workspaceRoot> clarified
```

## 约束

- 所有结论都必须带 user source；EV、推断、gap 不构成用户确认。
- 无法获得知识证据不是阻塞条件：记录 gap，向用户说明不确定性并请求确认。
