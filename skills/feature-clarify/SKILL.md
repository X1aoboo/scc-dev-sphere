---
name: feature-clarify
description: 在主会话中以用户确认和知识证据逐条澄清 feature 需求，并将结论追加到 inputs/requirement.md。用于需求澄清、需求确认、歧义挖掘、证据缺口记录；知识查询只由一次性子 Agent 执行。
---

# Feature Clarify — 需求澄清

在主会话完成澄清并追加写入 `inputs/requirement.md`（永不覆盖原始需求）；模型按「完成判断原则」自判完成。

## 硬规则

- `state.status !== 'initialized'` 时停止并提示从 workflow 获取下一动作；读取 requirement、`evidence/evidence-registry.json` 与采用的 `evidence/knowledge/EV-*.md`，恢复已确认事实、EV、gap 和问答历史，仅重问未完成或受影响项。
- **MUST NOT directly query the knowledge base in the main session**。需要知识时 **MUST dispatch a one-shot `knowledge-query` subagent**，**MUST NOT reuse agent IDs**、**MUST NOT use teammate**、不跨轮恢复；每次均为新的 `general-purpose` Task，**MUST wait for the structured EV/gap result**。
- 子 Agent prompt 必须说明查询意图（业务规则/系统模块/接口/数据/权限/性能/部署）、要求加载并遵循 `scc-dev-sphere:knowledge-query`、返回 `{facts, gaps}`（fact 含 `evidenceId`、`reliability`），且不得使用 AskUserQuestion；无法确认即报告 gap。不得将 skill 名作为 agent type。
- 每个采用事实必须有 EV 快照和 registry 条目；证据不足不阻塞，记录「知识证据缺口」（主题、status、reliability、用户结论）。EV、推断和 gap 只作候选，**Only persist user-confirmed conclusions**。
- 所有结论必须带 `[user: …]` 来源；候选推断只保留在「澄清记录」，不得伪装为最终事实。


## 澄清闭环

1. 启动时构造初始查询并按硬规则获取 EV/gap；基于原始需求与 EV/gap，推荐 `functional` / `technical` / `mixed`，以 `single_select`（2–3 项，推荐项置首）请用户确认，并记录类型、来源和确认时间。
2. 拆成具体需求点（能力、规则、约束或交互），逐点挖掘：模糊量词、未定义术语、隐含假设、缺失分支、可选/必选不明、冲突/依赖。
3. 每条歧义映射到一个记录位置：业务目标→`businessGoal`；用户场景→`usersAndScenarios`；行为/规则/边界→`functionalScope` 或 `nonGoalsAndBoundaries`；可验收结果→`acceptanceCriteria`；环境/时序/依赖/风险→`constraintsAndRisks`；接口/协议/数据/部署→技术契约（仅 `technical`/`mixed`）。
4. **Ask one mined ambiguity at a time.** 若涉及且无 EV 覆盖的业务规则、系统、模块、接口、数据、权限、性能或部署，先按硬规则查询。每题提供推荐结论、理由、2–3 个候选及来源（`[knowledge: EV-001]` / `[inference: …]` / `[user: …]`）。
5. 用户确认后，直接写入相应结论（来源和确认时间），并在「澄清记录」追加问答；反馈引入新检索线索时先查询、记录新 gap，再重新拆解和挖掘。
6. `functional` **MUST NOT** 追问与用户价值、风险或验收无关的 API、protocol 或技术契约。`technical`/`mixed` 维护「技术契约」：逐项澄清适用契约及关键子字段（如 URL、协议、请求响应、性能），不适用项记录理由。

## 完成判断原则

全部满足后才展示汇总并用 `confirm_gate` 请求最终确认：

- 已确认需求类型；六维度均有明确、经用户确认的结论，无「待定／可能／视情况」等未消歧措辞。
- `technical`/`mixed` 的所有适用技术契约已澄清；`functional` 未被追问无关技术细节；再挖不出新歧义。
- 已展示 `inputs/requirement.md` 汇总并获最终确认。任一不满足则继续澄清，不得推进状态。

确认后记录「最终确认」时间，并执行：

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js set-task-status <workspaceRoot> clarified
```

## `inputs/requirement.md` 追加结构

```text
# 原始需求
<feature-init 写入的文本>

# 需求澄清
## 需求类型
## 结论            （六维度；每条带来源与确认时间）
## 技术契约         （仅 technical/mixed；适用项及子字段，不适用项含理由）
## 知识证据缺口     （主题、status、reliability、用户结论）
## 澄清记录         （维度｜推荐与理由｜候选及来源｜用户回答）
## 最终确认         （用户最终确认时间）
```
