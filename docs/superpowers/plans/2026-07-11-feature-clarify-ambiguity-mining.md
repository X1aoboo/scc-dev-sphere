# Feature Clarify 歧义挖掘策略 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `feature-clarify` skill 的提问从固定维度遍历改为歧义挖掘循环，主动从原始需求里挖模糊点、逐条带推荐答案追问，挖尽为止。

**Architecture:** 单文件 prompt 改动——重写 `skills/feature-clarify/SKILL.md`：新增「歧义挖掘策略」章节（拆解→分类法挖歧义→映射→带推荐答案逐条问→循环），用它替换原执行步骤第 4、5 步并把第 6 步重编号为第 5 步。确定性 script、`clarification` schema、`requirement.md` 契约、node 测试逻辑均不动；唯一确定性回归门是 `skill-contracts.test.js` 对 SKILL.md 文案的正则断言——重写必须逐字保留这些短语。

**Tech Stack:** Markdown skill 文件；Node.js `node:test`（仅回归用）。

## Global Constraints

- 唯一被修改的源文件：`skills/feature-clarify/SKILL.md`。不得改 `scripts/feature-requirement-clarification.js`、不得改任何 `scripts/test/*.test.js`、不得改 `inputs/requirement.md` 生成逻辑。
- 中文 UI 文案遵循项目既有风格（与现 SKILL.md 一致）。
- 提问交互仍由 AskUserQuestion 承担；知识查询仍由一次性 `general-purpose` 子 Agent 承担（`subagent_type` 不得填 skill 名）。
- 所有时间戳类字段、函数名（`recordConclusion` / `recordTechnicalConclusion` / `recordTechnicalImpactDecision` / `confirmNoTechnicalImpacts` / `recordEvidenceGap` / `shouldRequery` / `validateClarification` / `renderRequirementMarkdown` / `recordFinalConfirmation` / `createClarification`）必须与 script 导出名逐字一致。

---

## 文件结构

| 文件 | 责任 | 本次动作 |
|---|---|---|
| `skills/feature-clarify/SKILL.md` | feature-clarify skill 的全部 prompt 与执行步骤 | **重写**（唯一源改动） |
| `scripts/test/skill-contracts.test.js` | 对 SKILL.md 文案的正则契约断言 | 不改（作为回归门） |
| `scripts/test/feature-requirement-clarification.test.js` | 确定性 script 单测 | 不改（回归门） |
| `scripts/test/feature-workflow-clarification.test.js` | 状态流转/恢复单测 | 不改（回归门） |
| `docs/superpowers/specs/2026-07-11-feature-clarify-ambiguity-mining-design.md` | 本计划依据的设计文档 | 不改（只读引用） |

---

## Task 1: 重写 feature-clarify SKILL.md（歧义挖掘策略 + 步骤重构）

**Files:**
- Modify: `skills/feature-clarify/SKILL.md`（整文件替换）

**Interfaces:**
- Consumes: script 导出函数名（见 Global Constraints），保持逐字引用。
- Produces: 一份仍通过 `skill-contracts.test.js` 全部正则断言、且含「歧义挖掘策略」章节与新第 4 步「歧义挖掘循环」的 SKILL.md。

**必须保留的契约短语**（`skill-contracts.test.js` 正则断言，case-insensitive，逐字出现即可）：
`MUST dispatch a one-shot `knowledge-query` subagent`、`MUST NOT directly query the knowledge base in the main session`、`MUST wait for the structured EV/gap result`、`MUST NOT reuse agent IDs`、`MUST NOT use teammate`、`only persist user-confirmed conclusions`、`one requirement dimension at a time`、`shouldRequery`、`validateClarification`、`set-task-status <workspaceRoot> clarified`、`evidence/evidence-registry.json`、`EV-*.md`、`only re-ask incomplete or affected dimensions`、`final summary is rejected, return to the affected dimension`、`status`/`reliability`/`userResolution`（同一 gap 描述里三者依次出现）、`functional` + `MUST NOT` + `API` + `protocol`（同段）、`northbound API` + `apiUrl` + `protocol` + `requestResponse` + `performance`（同段）、`technical`/`mixed` + `applicable` + `contract`（同段）。

- [ ] **Step 1: 备份当前文件并整文件替换为新内容**

用 Write 工具把 `skills/feature-clarify/SKILL.md` 整文件替换为以下内容（已逐条核对上述契约短语均保留）：

````markdown
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
每轮用户反馈后：`shouldRequery(feedback)` 为真 → 先派发一次性子 Agent；用新事实 + 新 gap 重新拆解/重新挖歧义（答案可能引入新点、消除旧点、暴露新依赖）；继续逐条问。**停止条件**：再挖不出新歧义 **且** `validateClarification` 六维度 + 适用技术契约全部确认 **且** 用户最终确认。

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
````

- [ ] **Step 2: 人工核对契约短语（改完后、跑测试前自检）**

逐条在落盘后的 `skills/feature-clarify/SKILL.md` 中确认下列短语各出现至少一次（用 grep 一次性核验）：

Run: `grep -nE "MUST dispatch a one-shot .knowledge-query. subagent|MUST NOT directly query the knowledge base in the main session|MUST wait for the structured EV/gap result|MUST NOT reuse agent IDs|MUST NOT use teammate|only persist user-confirmed conclusions|one requirement dimension at a time|only re-ask incomplete or affected dimensions|final summary is rejected, return to the affected dimension|northbound API" skills/feature-clarify/SKILL.md`
Expected: 至少 10 行命中（每个模式一行）。若有模式未命中，回到 Step 1 修正对应段落后再继续。

---

## Task 2: 回归验证 + 提交

**Files:**
- 验证：`scripts/test/skill-contracts.test.js`、`scripts/test/feature-requirement-clarification.test.js`、`scripts/test/feature-workflow-clarification.test.js`
- 提交：`skills/feature-clarify/SKILL.md`

**Interfaces:**
- Consumes: Task 1 产出的新 SKILL.md。
- Produces: 全绿回归 + 一个提交。

- [ ] **Step 1: 跑 skill 契约测试（核心回归门）**

Run: `node --test scripts/test/skill-contracts.test.js`
Expected: 全部 test PASS（含 4 条 `feature-clarify ...` 用例）。若某条 `assert.match` 失败，对照失败的正则在 SKILL.md 里补回缺失短语——**不得改测试**。

- [ ] **Step 2: 跑澄清 script 单测（确认未误改 script 契约引用）**

Run: `node --test scripts/test/feature-requirement-clarification.test.js`
Expected: 全部 PASS。

- [ ] **Step 3: 跑工作流澄清测试（确认状态流转描述未受影响）**

Run: `node --test scripts/test/feature-workflow-clarification.test.js`
Expected: 全部 PASS。

- [ ] **Step 4: 人工 checklist 对照设计文档**

逐项确认 `docs/superpowers/specs/2026-07-11-feature-clarify-ambiguity-mining-design.md`：
- §2.1 拆解：SKILL.md「拆解 Decompose」存在 ✓
- §2.2 六类分类法：「挖歧义 Mine」列出全部六类 ✓
- §2.3 映射表：「映射 Map」覆盖六维度 + 技术契约 ✓
- §2.4 带推荐答案逐条问：「逐条问 Ask」含 ①②③④ ✓
- §2.5 停止条件：「循环 Loop」含"再挖不出新歧义 且 validateClarification 全部确认" ✓
- §3.2 新第 4 步伪流程六小步：执行步骤 §4 的 1–6 与之一致 ✓
- §3.3 三个查询时机：首轮（步骤 2）/ 循环内按需（步骤 4.2）/ 反馈重查（步骤 4.4）均含且标 MUST ✓
- §3.4 functional 不被拖入技术 + technical/mixed 契约强制：步骤 4 末段保留 ✓

任一项不符则回到 Task 1 Step 1 修正。

- [ ] **Step 5: 提交**

当前在 `main` 分支。按仓库约定应先开分支再提交（执行者自行决定分支名，如 `feat/clarify-ambiguity-mining`）。

```bash
git checkout -b feat/clarify-ambiguity-mining
git add skills/feature-clarify/SKILL.md docs/superpowers/specs/2026-07-11-feature-clarify-ambiguity-mining-design.md docs/superpowers/plans/2026-07-11-feature-clarify-ambiguity-mining.md
git commit -m "feat(clarify): drive questioning by ambiguity mining instead of fixed-dimension walk"
```

Expected: 一个提交，仅含上述三个文件（SKILL.md + 本次设计文档 + 本计划文档）。不得夹带其它改动。

---

## Self-Review

**1. Spec coverage：** 设计 §1（背景/目标）→ 不产生代码任务，仅动机；§2.1–2.5（策略）→ Task 1 新「歧义挖掘策略」章节；§3.1（步骤重构）+ §3.2（伪流程）→ Task 1 执行步骤 §4；§3.3（三个查询时机）→ Task 1 派发段 + 步骤 4.2 + 4.4；§3.4（保留规则）→ Task 1 步骤 4 末段 + 步骤 1；§4.1–4.3（script/测试/契约不变）→ Global Constraints + Task 2 回归；§5（不变量）→ 约束段 + 步骤内 MUST。无遗漏。

**2. Placeholder scan：** 无 TBD/TODO；Step 1 给出整文件实际内容；所有 Run 命令含 expected 输出；函数名逐字与 script 导出一致。✓

**3. Type/naming consistency：** `recordConclusion` / `recordTechnicalConclusion` / `recordTechnicalImpactDecision` / `confirmNoTechnicalImpacts` / `recordEvidenceGap` / `shouldRequery` / `validateClarification` / `renderRequirementMarkdown` / `recordFinalConfirmation` / `createClarification` 与 `feature-requirement-clarification.js` 导出名逐字一致；`subagent_type: "general-purpose"` 与现 SKILL.md 及 commit `7cdfd62` 修复一致。✓
