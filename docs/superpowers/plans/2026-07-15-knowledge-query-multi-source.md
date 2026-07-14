# Knowledge Query 多数据源重构 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重写 knowledge-query skill：新增多数据源配置、subagent-prompt 模板、4 步查询流程（registry → subagent → 用户 → 读快照返回）。

**Architecture:** 3 个文件：2 个新静态模板 + 1 个 SKILL.md 全文重写。无脚本改动。

**Tech Stack:** Markdown + JSON

## Global Constraints

- evidence 归档格式不变（EV 快照 + registry）
- 子 Agent 每次新 Agent、不复用 ID
- skill 可被用户直接调用或被 Agent 派发为 subagent
- skill-contracts 测试必须通过

---

### Task 1: 新增 `skills/knowledge-query/knowledge-sources.json`

**Files:**
- Create: `skills/knowledge-query/knowledge-sources.json`

- [ ] **Step 1: 写入默认配置**

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

- [ ] **Step 2: 验证 JSON 格式**

```bash
node -e "JSON.parse(require('fs').readFileSync('skills/knowledge-query/knowledge-sources.json','utf8')); console.log('PASS')"
```

- [ ] **Step 3: 提交**

```bash
git add skills/knowledge-query/knowledge-sources.json
git commit -m "feat(knowledge-query): add default data source configuration"
```

---

### Task 2: 新增 `skills/knowledge-query/subagent-prompt.md`

**Files:**
- Create: `skills/knowledge-query/subagent-prompt.md`

- [ ] **Step 1: 写入子 Agent 指令模板**

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

- [ ] **Step 2: 提交**

```bash
git add skills/knowledge-query/subagent-prompt.md
git commit -m "feat(knowledge-query): add subagent instruction prompt template"
```

---

### Task 3: 重写 `skills/knowledge-query/SKILL.md`

**Files:**
- Modify: `skills/knowledge-query/SKILL.md`（全文替换）

- [ ] **Step 1: 用以下内容替换**

```markdown
---
name: knowledge-query
description: 统一知识查询入口。自然语言触发，自动检索已有证据、从多数据源发现知识、记录新 evidence。
---

# Knowledge Query — 知识查询

统一知识查询入口。自然语言触发，步骤1 自动判断进入配置流还是查询流。

## 配置

两层 fallback：

```
<workspace>/config/knowledge-sources.json        ← 用户配置，优先
    ↓ 字段缺失 fallback
skills/knowledge-query/knowledge-sources.json    ← skill 默认
```

默认数据源及优先级：skill → 本地目录 → 代码仓 → MCP → WebSearch。skill 和本地/代码仓默认启用（需配置具体名称/路径），MCP 和 WebSearch 默认关闭。

## 工作流一：数据源配置

自然语言自动识别配置意图：

- "当前数据源有哪些？" → 展示生效配置（标注来源：workspace config / skill default）
- "把 data/docs/ 加到本地数据源" → 交互式修改 → 写入 `<workspace>/config/knowledge-sources.json`
- "恢复默认数据源配置" → 删除 workspace config，回退到 skill 默认

交互式修改：展示当前配置 → 逐项询问启用/禁用/加路径/调优先级 → 确认 → 写入。

## 工作流二：知识查询

### 步骤1 — 解析意图 + 检索 registry

读取 `evidence-registry.json` + 已有快照摘要。判断是否覆盖本次查询。

- 匹配 → EV-ID 列表 → 跳步骤4
- 未匹配 → 进入步骤2

### 步骤2 — 内部 subagent 查询自动源

1. 读取 `subagent-prompt.md` 模板
2. 拼接当前生效的数据源配置（workspace config > skill default fallback 后的最终值）+ 查询主题
3. 通过 `Agent` 工具派发一次性 `general-purpose` Task

子 Agent 按优先级逐个查询自动源，每层命中且置信度足够即停止。

- 查到 → 子 Agent 分配 EV-ID + 写快照 + 更新 registry → 返回 EV-ID → 跳步骤4
- 未查到 → 进入步骤3

### 步骤3 — 向用户请求

- 可用 AskUserQuestion → 问用户 → 分配 EV-ID + 写快照 + 更新 registry → 跳步骤4
- 不可用 → 返回「未找到」

### 步骤4 — 读快照返回

按 EV-ID 列表读取 `evidence/knowledge/EV-xxx-*.md` 快照，返回知识内容 + EV-ID。

## 返回格式（subagent 调用场景的契约）

调用方通过 Agent 派发本 skill 时，返回文本遵循此结构：

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
```

- [ ] **Step 2: 运行契约测试**

```bash
node scripts/test/skill-contracts.test.js
```
Expected: 全部通过。如有失败，根据新设计更新测试断言，不保留旧契约。

- [ ] **Step 3: 提交**

```bash
git add skills/knowledge-query/SKILL.md
git commit -m "feat(knowledge-query): multi-source redesign with 4-step query flow"
```
