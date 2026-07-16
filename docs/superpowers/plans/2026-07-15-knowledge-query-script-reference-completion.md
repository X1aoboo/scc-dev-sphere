# Knowledge Query 脚本引用完整化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 SKILL.md 和 subagent-prompt.md 中的脚本引用全部改为完整 CLI 调用语法，消除 LLM 读取脚本文件的需要。

**Architecture:** 1 个 task，2 个文件，纯文本 Edit 操作。每处脚本引用从命令名或泛泛提及改为 `node scripts/knowledge-query.js <cmd> <workspaceRoot> [args]` 形式。

**Tech Stack:** 纯文本编辑，无代码逻辑变更。

## Global Constraints

- 脚本接口不变
- 工作流逻辑不变
- hooks 行为不变
- evidence 格式不变
- `<workspaceRoot>` 为项目根目录（`"${CLAUDE_PLUGIN_ROOT}/.."`）

---

### Task 1: SKILL.md + subagent-prompt.md 脚本引用完整化

**Files:**
- Modify: `skills/knowledge-query/SKILL.md`
- Modify: `skills/knowledge-query/subagent-prompt.md`

**Interfaces:**
- Consumes: 无
- Produces: 更新后的两个文件

- [ ] **Step 1: 配置工作流 — 替换泛泛引用 + 补全操作命令**

Edit `skills/knowledge-query/SKILL.md`，第一处：

```
old: 配置读取/修改/重置 全部通过 `scripts/knowledge-query.js` 确定性执行。

默认数据源及优先级
new: 配置操作均通过 `node scripts/knowledge-query.js` 执行（`<workspaceRoot>` 为项目根目录，即 `"${CLAUDE_PLUGIN_ROOT}/.."`）。

默认数据源及优先级
```

第二处，展示配置：

```
old: - "当前数据源有哪些？" → `show-config` 展示生效配置（标注来源：workspace config / skill default）
new: - "当前数据源有哪些？" → `node scripts/knowledge-query.js show-config <workspaceRoot>` 展示生效配置（标注来源：workspace config / skill default）
```

第三处，添加目录：

```
old: - "把 data/docs/ 加到本地数据源" → 交互式修改 → `add-config-item` 写入 workspace config
new: - "把 data/docs/ 加到本地数据源" → 交互式修改 → `node scripts/knowledge-query.js add-config-item <workspaceRoot> sources.local.dirs /data/docs` 写入 workspace config
```

第四处，禁用源：

```
old: - "禁用 MCP 数据源" → `update-config sources.mcp.enabled false`
new: - "禁用 MCP 数据源" → `node scripts/knowledge-query.js update-config <workspaceRoot> sources.mcp.enabled false`
```

第五处，重置：

```
old: - "恢复默认数据源配置" → `reset-config` 删除 workspace config
new: - "恢复默认数据源配置" → `node scripts/knowledge-query.js reset-config <workspaceRoot>` 删除 workspace config
```

- [ ] **Step 2: 步骤1 — 补全 registry 检索命令**

```
old: registry 检索由 `scripts/knowledge-query.js` 确定性执行。
new: registry 检索通过 `node scripts/knowledge-query.js next-ev-id <workspaceRoot>` 获取最新编号，通过 `node scripts/knowledge-query.js read-evidence <workspaceRoot> <evId>` 读取已有快照摘要。
```

- [ ] **Step 3: 步骤2 — 补全 register-evidence 命令**

```
old: 查到后通过 `scripts/knowledge-query.js register-evidence` 写入 evidence（分配 EV-ID + 快照 + registry），返回 EV-ID
new: 查到后通过 `node scripts/knowledge-query.js register-evidence <workspaceRoot> "<描述>" <临时文件路径>` 写入 evidence（分配 EV-ID + 快照 + registry），返回 EV-ID
```

- [ ] **Step 4: 步骤3 — 补全 register-evidence 命令**

```
old: 用户答复后通过 `scripts/knowledge-query.js register-evidence` 写入 evidence，跳步骤4
new: 用户答复后通过 `node scripts/knowledge-query.js register-evidence <workspaceRoot> "<描述>" <临时文件路径>` 写入 evidence，跳步骤4
```

- [ ] **Step 5: 步骤4 — 补全 read-evidence 命令**

```
old: 按 EV-ID 列表通过 `scripts/knowledge-query.js read-evidence` 读取快照。
new: 按 EV-ID 列表通过 `node scripts/knowledge-query.js read-evidence <workspaceRoot> <evId>` 读取快照。
```

- [ ] **Step 6: subagent-prompt.md — 补全配置读取命令**

Edit `skills/knowledge-query/subagent-prompt.md`：

```
old: 可通过 `scripts/knowledge-query.js read-config <workspaceRoot>` 获取当前生效的数据源配置（脚本自动处理两层 fallback）。
new: 当前生效的数据源配置由主流程注入，无需自行读取。如需获取，可通过 `node scripts/knowledge-query.js read-config <workspaceRoot>` 获取。
```

- [ ] **Step 7: 验证**

```bash
# 确认所有脚本引用均以 node scripts/knowledge-query.js 开头
grep -n 'knowledge-query.js' skills/knowledge-query/SKILL.md skills/knowledge-query/subagent-prompt.md
```

Expected: 每行均包含 `node scripts/knowledge-query.js`，无孤立的 `scripts/knowledge-query.js`（即无 `node` 缺失项）。

```bash
# 确认无意外变更
git diff --stat
```

Expected: 仅 2 个文件变更。

- [ ] **Step 8: Commit**

```bash
git add skills/knowledge-query/SKILL.md skills/knowledge-query/subagent-prompt.md
git commit -m "docs(knowledge-query): use full CLI syntax for script references

Replace all shorthand script references with complete
'node scripts/knowledge-query.js <cmd> <workspaceRoot>' syntax
to eliminate need for LLM to read script source at execution time."
```

---

### 自审

| 检查项 | 结果 |
|--------|------|
| Spec 覆盖 | 8 步对应 spec §3.1-3.5（SKILL.md 5 处）+ §4.1（subagent-prompt.md 1 处） |
| 占位符扫描 | 无 TBD/TODO，所有 old/new 字符串为精确匹配 |
| 类型一致性 | 所有命令语法一致：`node scripts/knowledge-query.js <cmd> <workspaceRoot> [args]` |
