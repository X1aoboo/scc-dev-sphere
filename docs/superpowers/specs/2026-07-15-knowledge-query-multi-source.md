# Knowledge Query 多数据源重构设计

- **状态:** 已确认
- **日期:** 2026-07-15
- **范围:** `skills/knowledge-query/SKILL.md`（全文重写）、`skills/knowledge-query/knowledge-sources.json`（新增）、`skills/knowledge-query/subagent-prompt.md`（新增）、`<workspace>/config/knowledge-sources.json`（可选用户配置）
- **关联:** `docs/superpowers/specs/2026-07-11-knowledge-query-subagent-dispatch-design.md`（旧版，将被取代）

## 1. 目标

将 knowledge-query 从单一 MCP 查询扩展为多数据源统一知识查询入口。支持 registry 缓存、skill 调用、本地目录、代码仓、WebSearch。返回文本格式，自动归档新 evidence。

## 2. Skill 概述

统一知识查询入口。自然语言触发，步骤1 自动判断进入配置流还是查询流。无需命令、无需参数。

## 3. 配置模型

两层 fallback：

```
<workspace>/config/knowledge-sources.json        ← 用户配置，优先
    ↓ 字段缺失 fallback
skills/knowledge-query/knowledge-sources.json    ← skill 默认
```

### skill 默认 knowledge-sources.json

```json
{
  "sources": {
    "mcp":   { "enabled": false },
    "skill": { "enabled": true, "names": [] },
    "local": { "enabled": true, "dirs": [] },
    "repo":  { "enabled": true, "paths": [] },
    "web":   { "enabled": false }
  },
  "priority": ["skill", "local", "repo", "mcp", "web"]
}
```

## 4. 工作流一：数据源配置

自然语言触发，步骤1 自动识别配置意图：

- "当前数据源有哪些？" → 展示生效配置（标注来源）
- "把 data/docs/ 加到本地数据源" → 交互式修改 → 写入 workspace config
- "恢复默认数据源配置" → 重置（删 workspace config）

交互式修改流程：展示当前配置 → 逐项询问 → 确认 → 写入。

## 5. 工作流二：知识查询（4 步）

### 步骤1 — 解析意图 + 检索 registry

读取 `evidence-registry.json` + 已有快照摘要。LLM 判断是否覆盖本次查询。

- 匹配 → EV-ID 列表 → 跳步骤4
- 未匹配 → 进入步骤2

### 步骤2 — 内部 subagent 查询自动源

skill 主线读取 `subagent-prompt.md` 模板，拼接当前生效的数据源配置 + 查询主题，通过 `Agent` 工具派发一次性 `general-purpose` Task。子 Agent 按优先级逐个查询：skill → 本地目录 → 代码仓 → MCP → WebSearch。每层命中且置信度足够即停止。

- 查到 → 子 Agent 分配 EV-ID + 写快照 + 更新 registry → 返回 EV-ID → 跳步骤4
- 未查到 → 进入步骤3

### 步骤3 — 向用户请求

- 可用 AskUserQuestion → 问用户 → 记录 EV（分配 ID + 快照 + registry）→ 跳步骤4
- 不可用 → 返回「未找到」

### 步骤4 — 读快照返回

按 EV-ID 列表读取 `evidence/knowledge/EV-xxx-*.md` 快照。返回知识内容 + EV-ID（供引用追溯）。

## 6. 返回格式

纯文本，非 JSON：

```
## 查询结果：<主题>

### 已有证据
- [EV-012] <摘要>：<reliability>
  <内容>

### 本次发现
- [EV-028] <摘要>：<reliability>
  <内容>

### 未找到
（如有）<gap 说明>
```

## 7. 内部 subagent 机制

### 7.1 静态模板 `skills/knowledge-query/subagent-prompt.md`

skill 目录内的静态文件，定义子 Agent 的行为契约。不会被运行时修改。

```markdown
你是一个知识查询 Agent。

## 查询策略

skill 主线会提供当前生效的数据源配置（具体名称、路径、启用状态）和优先级顺序。按优先级逐个查询，每命中一个源且置信度足够即停止。

## 数据源查询方式
- skill：Skill 工具调用指定的知识查询 skill
- 本地目录：Bash find + Read
- 代码仓：Bash grep + Read
- MCP：MCP 知识库工具
- WebSearch：WebSearch 工具

## 查到后的处理

1. 分配 EV 编号（延续 evidence-registry.json 现有编号体系）
2. 写入 evidence 快照：`evidence/knowledge/EV-xxx-<描述>.md`
3. 更新 `evidence/evidence-registry.json`

只返回 EV-ID，不返回知识内容。知识内容由主流程步骤4统一读取。

## 未查到

如实报告哪些源已查询、均未命中。

## 禁止
- 不得调用 AskUserQuestion
```

### 7.2 配置注入

skill 派发子 Agent 时，读取模板 + 拼接：

1. 当前生效的数据源配置（workspace config > skill default fallback 后的最终值）
2. 调用方的查询主题

子 Agent 收到的完整 prompt = 模板 + 配置上下文 + 查询主题。子 Agent 不需要理解配置文件的存储位置。

## 8. 与调用方衔接

- 调用方 `Skill("knowledge-query")` + 查询意图 → 拿到知识内容 + EV-ID
- 无参数、无命令、无反依赖
- 与 feature-clarify 阶段3b 情况二直接对接

## 9. 实施范围

| 做 | 不做 |
|----|------|
| 新增 `knowledge-sources.json` 模板 | 新增独立配置脚本 |
| 新增 `subagent-prompt.md` 模板 | 修改 evidence registry 结构 |
| 重写 `SKILL.md`（配置流 + 查询流 4 步） | — |

## 10. 不变式

- evidence 归档格式不变（EV 快照 + registry）
- 子 Agent 每次新 Agent、不复用 ID
- skill 可被用户直接调用或被 Agent 派发为 subagent
