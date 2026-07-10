# knowledge-query 子 Agent 派发修复设计

> 日期：2026-07-11
> 范围：修复 `feature-clarify` skill 派发知识查询子 Agent 失败（Agent type not found）。

## 问题

在 `test_project` 中执行 `/scc-dev-sphere:feature-clarify` 步骤2 时，主会话按 skill 措辞"dispatch a one-shot `knowledge-query` subagent"派发，填入 `subagent_type: "scc-dev-sphere:knowledge-query"`，报错：

```
Error: Agent type 'scc-dev-sphere:knowledge-query' not found.
```

随后主会话 fallback 为 `Skill(scc-dev-sphere:knowledge-query)` 在主会话内加载，又因 MCP 知识库工具未接入报 `Invalid tool parameters`。

## 根因

1. **技能名 ≠ agent 类型。** `knowledge-query` 在插件中只定义为 skill（`skills/knowledge-query/SKILL.md`），没有对应的 `agents/knowledge-query.md`。Claude Code 的 Task（Agent）工具要求 `subagent_type` 必须是已注册 agent；skill 名不能当类型用。
2. **MCP 未接入（已知，本轮不处理）。** 即使派发正确，子 Agent 在执行 MCP 查询步骤时仍会失败，属独立的环境问题。

## Claude Code 派发事实（决策依据）

- 从 skill 派发子 Agent = 调 Task 工具，`subagent_type` 必须是已注册 agent。
- 内置可直接用：`general-purpose`（全工具，含 Skill 工具）、`Explore`、`Plan`。
- `general-purpose` 子 Agent 可在自己的上下文里 `Skill(scc-dev-sphere:knowledge-query)` 加载查询逻辑，行为仍是单一来源（skill 内），不重复。

## 方案

只改 `skills/feature-clarify/SKILL.md` 的措辞：把"派发 knowledge-query subagent"改写为**可执行的派发契约**——用 `subagent_type: "general-purpose"`，prompt 指示子 Agent 加载并遵循 `scc-dev-sphere:knowledge-query` skill、返回结构化 EV/gap、不得使用 AskUserQuestion。`knowledge-query/SKILL.md` 本身不改。

不新建 `agents/knowledge-query.md`（避免过度设计）。不扩展 `devsphere-dispatch.js`（其 design/review kind 服务于 agent-teams teammate，与一次性子 Agent 语义相反，且 `feature-clarify` 明文禁止 teammate）。

### 派发契约（写入 SKILL，步骤2/5 引用）

- 工具：Task（Agent）
- `subagent_type`：`"general-purpose"`（**不得**用 `scc-dev-sphere:knowledge-query` —— 那是 skill 名，非注册 agent）
- `description`：简短查询主题
- `prompt` 必含：① 查询意图 ② "加载并严格遵循 scc-dev-sphere:knowledge-query skill" ③ "返回结构化 EV/gap JSON" ④ "不得使用 AskUserQuestion，缺口一律作为 gap 上报"
- 每次派发都是新 Task，不复用、不跨轮恢复、不作 teammate
- 派发后主会话必须等待结构化结果返回

## 取舍

`general-purpose` 自带 AskUserQuestion，"不得问用户"靠 prompt 遵守而非工具级硬禁。当前查询任务用 prompt 约束足够；若将来要硬保证，再升级为自定义 agent（在其 frontmatter 限定 tools）。

## 验证

- spec 自检：无占位符、无内部矛盾、范围单一（一处 prose 修改）。
- 实现：编辑 `feature-clarify/SKILL.md`，引入"知识查询子 Agent 派发契约"段，步骤2/5 改为引用它；修正开头描述与约束段中"knowledge-query subagent"的误导措辞。
- 端到端：MCP 接入后，`/feature-clarify` 应能成功派发 general-purpose 子 Agent（本轮不可端到端验证，因 MCP 未接入）。
