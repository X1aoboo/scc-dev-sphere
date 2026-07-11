---
name: feature-clarify
description: 在主会话中以用户确认和知识证据为基础、按歧义挖掘策略逐条澄清 feature 需求；结论直接写入 inputs/requirement.md，由模型按完成判断原则自判完成。知识查询始终由一次性子 Agent 完成。用于需求澄清、需求确认、歧义挖掘、逐条提问、证据缺口记录。
---

# Feature Clarify — 需求澄清

在主会话完成需求澄清。**澄清内容只写入 `inputs/requirement.md`，不写入 `state.json`**（`state.json` 只维护状态）。是否澄清完成由下方「完成判断原则」自判，不再有确定性校验函数。**MUST NOT directly query the knowledge base in the main session** —— 知识查询只能派发一次性子 Agent 执行（见下）。每次派发都是新的 Task：**MUST NOT reuse agent IDs**，**MUST NOT use teammate**，不跨轮恢复。

## 派发知识查询子 Agent

初始查询、循环内按需查询与每次重查都 **MUST dispatch a one-shot `knowledge-query` subagent**（一次性子 Agent，承担知识查询任务）。派发方式：

- **工具：** Task（Agent）
- **`subagent_type`：** `"general-purpose"`。**禁止**填 `"scc-dev-sphere:knowledge-query"` —— 那是 skill 名、非注册 agent，会报 `Agent type not found`。
- **`description`：** 简短查询主题（如 `Query knowledge base for blog system`）。
- **`prompt` 必须包含：** ① 查询意图（业务规则/系统模块/接口/数据/权限/性能/部署）② "加载并遵循 `scc-dev-sphere:knowledge-query` skill 执行查询与证据收集" ③ "返回结构化 EV/gap JSON（`facts` + `gaps`，每项 fact 含 evidenceId 与 reliability）" ④ "不得使用 AskUserQuestion；无法确认的一律作为 gap 上报"。
- 每次都是新 Task，不复用、不跨轮恢复、不作 teammate。

派发后 **MUST wait for the structured EV/gap result** 再继续。

## 歧义挖掘策略

澄清以**歧义驱动**，而非按固定维度顺序机械提问。六项固定维度（`businessGoal` / `usersAndScenarios` / `functionalScope` / `nonGoalsAndBoundaries` / `acceptanceCriteria` / `constraintsAndRisks`）是 `inputs/requirement.md` 中「结论」章节的**记录骨架与完整性自判依据**；提问由下列策略驱动。

### 拆解 Decompose
读取原始需求与初始 EV/gap 后，把需求拆成一组**具体需求点**（运行期推理）。一个"点" = 一个用户可见能力 / 一条业务规则 / 一个约束 / 一个交互。例："用户可以上传背景图片" 是一个点；"上传后立即生效" 是另一个点。

### 挖歧义 Mine
对每个点逐条扫描以下六类模糊，命中即产出一条**待澄清歧义**：

- **模糊量词/程度**：「快速/大量/友好/一般」无指标。
- **未定义术语**：业务/领域名词无明确含义。
- **隐含假设**：未声明的前置/环境/权限/时序。
- **缺失分支**：只有成功路径，缺失败/回滚/空/并发/边界。
- **可选 vs 必选**：「应该支持/可以」模糊。
- **冲突/依赖**：与其它点矛盾或依赖未澄清的点。

### 映射 Map
每条歧义映射到记录章节：用户行为/边界/规则 → `functionalScope` / `nonGoalsAndBoundaries`；成功/失败/边界的可验收结果 → `acceptanceCriteria`；隐含环境/时序/依赖假设、风险 → `constraintsAndRisks`；接口/协议/数据/部署契约 → 技术契约（仅 technical/mixed）；业务目标 → `businessGoal`；用户场景 → `usersAndScenarios`。

### 逐条问 Ask
**Ask one mined ambiguity at a time.** 每个问题必须含：① 推荐结论 ② 推荐理由 ③ 2–3 个候选 ④ 每个候选与推荐的来源标注（`[knowledge: EV-001]` / `[inference: …]` / `[user: …]`）。每条歧义映射到单一维度。用户确认后**直接 Edit `inputs/requirement.md`** 对应章节记录结论（带来源与确认时间）。**Only persist user-confirmed conclusions**；候选推断保留在「澄清记录」中，不伪装为最终事实。

### 循环 Loop
每轮用户反馈后：若反馈引入新检索线索（业务规则/系统/模块/接口/数据/权限/性能/部署等）→ 先派发一次性子 Agent；用新事实 + 新 gap 重新拆解/重新挖歧义（答案可能引入新点、消除旧点、暴露新依赖）；继续逐条问。循环到再挖不出新歧义、且下方「完成判断原则」全部满足。

## 集成契约

- **入口:** `/scc-dev-sphere:feature-clarify`
- **前置状态:** `state.status === 'initialized'`
- **读取:** `inputs/requirement.md`（含原始需求与已追加的澄清区块）、`evidence/evidence-registry.json`、采用的 `evidence/knowledge/EV-*.md`
- **写入:** 仅 `inputs/requirement.md`（追加澄清区块，**永不覆盖原始需求**）；不得写 `state.json` 的 `clarification` 字段（该字段不存在）。
- **完成标准:** 模型按「完成判断原则」自判通过 **且** 用户最终确认 → 执行 `set-task-status <workspaceRoot> clarified`。

## 执行步骤

### 1. 加载已有澄清

若 `status !== 'initialized'`，停止，提示从 workflow 取下一动作。读取 `inputs/requirement.md`（若已有「需求澄清」区块则从中续接）、`evidence/evidence-registry.json` 与采用的 `evidence/knowledge/EV-*.md`，恢复已确认事实、EV、缺口与问答历史。**Only re-ask incomplete or affected dimensions**：未受影响的已确认项不重复提问。不得把模型推测或知识库内容写成结论。

### 2. 获取初始知识证据

构造查询意图，**按上节派发一次性子 Agent**。等待结果后，确认每个采用的事实都有 `evidence/knowledge/EV-*.md` 快照和 `evidence/evidence-registry.json` 条目；知识库无结果或不足时，在 `inputs/requirement.md` 的「知识证据缺口」区块记录缺口（主题、status、reliability、用户结论）。事实仅作待确认候选。

### 3. 确认需求类型

基于原始需求与 EV/gap，推荐 `functional`/`technical`/`mixed` 并说明理由。AskUserQuestion `single_select`，2–3 选项，推荐项置首标 `(Recommended)`，每个选项说明带来源标签（`[knowledge: EV-001]` / `[inference: …]` / `[user: …]`）。用户确认后**直接 Edit `inputs/requirement.md`** 的「需求类型」章节记录。

### 4. 歧义挖掘循环

按「歧义挖掘策略」驱动提问：

1. 拆解需求点；对每点按六类分类法挖歧义 → 待澄清歧义列表。
2. 取下一条歧义（**一次一个**）。若该歧义涉及业务规则/系统/模块/接口/数据/权限/性能/部署且**无现存 EV 覆盖**，**MUST 先派发一次性 `knowledge-query` 子 Agent**（推荐前查），等待 EV/gap 并记录到 requirement.md。
3. 映射到维度或技术契约；AskUserQuestion 带推荐结论 + 理由 + 候选 + 来源标注；用户确认后**直接 Edit `inputs/requirement.md`** 对应章节记录结论、来源与确认时间，并在「澄清记录」追加一行问答日志。
4. 每次反馈后，若引入新检索线索 → **按上节派发一次性子 Agent**（不复用此前 agent ID），等待结果，新 gap 记入「知识证据缺口」。
5. 重新挖歧义（答案可能引入新点、消旧点、暴露依赖）；回到第 2 步。
6. 循环到再挖不出新歧义、且「完成判断原则」全部满足。

`functional` 需求 **MUST NOT** 追问与用户价值/风险/验收无关的 API、protocol 或技术契约——挖掘聚焦分类法中的缺失分支 / 可选 vs 必选 / 隐含假设。`technical`/`mixed`：维护「技术契约」章节，对每个受影响契约（如北向 API 的 URL、协议、请求响应、性能等子字段）澄清并记录结论；不适用项明确记为不适用，不替用户假定。

### 5. 完成判断与最终确认

按「完成判断原则」自判。未满足则逐项展示缺口并回到第 4 步相应维度继续，**不得** `set-task-status clarified`。全部满足后，向用户展示 `inputs/requirement.md` 的澄清汇总，AskUserQuestion `confirm_gate` 请求最终确认。用户确认后在「最终确认」章节记录确认时间，并执行：

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js set-task-status <workspaceRoot> clarified
```

## 完成判断原则

满足以下全部条件，才可进入最终确认并推进到 `clarified`：

- 需求类型（`functional`/`technical`/`mixed`）已确认并写入 `inputs/requirement.md`。
- 六项维度（业务目标 / 用户与场景 / 功能范围 / 非目标与边界 / 验收标准 / 约束与风险）各有**明确、经用户确认**的结论写入「结论」章节，且**不含**「待定 / 可能 / 视情况」等未消歧措辞。
- `functional` 需求未被追问无关技术契约；`technical`/`mixed` 的适用技术契约（含北向 API 等 Namespace 的 URL / 协议 / 请求响应 / 性能等关键子字段）均已澄清并写入「技术契约」章节。
- 再挖不出新的歧义点。
- 已向用户展示 `inputs/requirement.md` 汇总并经 `confirm_gate` 最终确认。

**任一不满足 → 继续澄清，不得 `set-task-status clarified`。**

## `inputs/requirement.md` 结构

`feature-init` 写入「原始需求」后，本 skill 以追加方式补充下列区块（**永不覆盖原始需求**）：

```
# 原始需求
<feature-init 写入的文本>

# 需求澄清
## 需求类型
## 结论            （六维度，每条带来源标注 [knowledge: EV-001]/[inference: …]/[user: …] 与确认时间）
## 技术契约         （仅 technical/mixed；含适用契约及子字段，不适用项标注理由）
## 知识证据缺口     （主题、status、reliability、用户结论）
## 澄清记录         （逐条问答日志：维度｜推荐项与理由｜候选项及来源｜用户最终回答）
## 最终确认         （用户最终确认时间）
```

## 约束

- 所有结论都必须带 user source；EV、推断、gap 不构成用户确认。
- 无法获得知识证据不是阻塞条件：记录 gap，向用户说明不确定性并请求确认。
- 不得在 `state.json` 写任何澄清内容；澄清的唯一持久化目标是 `inputs/requirement.md`。
