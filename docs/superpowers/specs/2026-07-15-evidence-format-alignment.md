# Evidence 快照格式对齐历史设计

- **状态:** 已确认
- **日期:** 2026-07-15
- **范围:** `scripts/knowledge-query.js`、`skills/knowledge-query/subagent-prompt.md`、`skills/knowledge-query/SKILL.md`
- **依据:** 历史设计（MVP Plan + PRD + 技术方案）逐字段评估
- **驱动:** 当前实现缺失溯源关键字段（sourceType、query），快照内容无摘要/全文区分

## 1. 目标

将 evidence 快照文件格式和 registry 结构与历史设计对齐，补齐溯源信息，区分摘要与全文。

## 2. 快照文件格式（EV-*.md）

### 当前

```markdown
# EV-001: <description>

**Registered:** 2026-07-15T...

<来自 stdin 的自由 Markdown 内容>
```

### 目标

```markdown
# EV-001: <description>

- **Source:** <sourceType>
- **Query:** <query>
- **Retrieved:** <timestamp>
- **Content Summary:**
<key findings, not full dump>
```

### 字段说明

| 字段 | 来源 | 说明 |
|------|------|------|
| `# EV-xxx: <description>` | 保留 | 标题行，ID + 主题描述 |
| `Source` | 新增 | sourceType 值，标识数据源类型 |
| `Query` | 新增 | 查询关键词，复现检索路径 |
| `Retrieved` | 改自 Registered | 重命名，语义更准确 |
| `Content Summary` | 新增 | 替代原文全量写入，强调关键发现摘要 |

## 3. Registry 结构（evidence-registry.json）

### 当前

```json
{
  "evidences": [
    {
      "id": "EV-001",
      "description": "...",
      "file": "evidence/knowledge/EV-001-xxx.md",
      "registeredAt": "2026-07-15T..."
    }
  ]
}
```

### 目标

```json
{
  "evidences": [
    {
      "id": "EV-001",
      "description": "...",
      "sourceType": "skill",
      "query": "审批规则 订单",
      "file": "evidence/knowledge/EV-001-xxx.md",
      "retrievedAt": "2026-07-15T..."
    }
  ]
}
```

### 字段变更

| 字段 | 变更 | 说明 |
|------|------|------|
| `id` | 保留 | EV-xxx |
| `description` | 保留 | 主题描述 |
| `sourceType` | **新增** | `skill \| local \| repo \| mcp \| web \| user` |
| `query` | **新增** | 查询关键词，自由文本 |
| `file` | 保留 | 快照相对路径 |
| `registeredAt` → `retrievedAt` | **重命名** | 与快照标题栏保持一致 |
| `registeredAt` | **删除** | 合并到 retrievedAt |

## 4. register-evidence 接口变更

### 当前

```bash
echo "<content>" | node scripts/knowledge-query.js register-evidence <workspaceRoot> "<description>"
```

参数：2 个（workspaceRoot, description）

### 目标

```bash
echo "<summary>" | node scripts/knowledge-query.js register-evidence <workspaceRoot> "<description>" <sourceType> "<query>"
```

参数：4 个（workspaceRoot, description, sourceType, query）

变更：
- 新增 `sourceType`（必填，枚举校验：skill | local | repo | mcp | web | user）
- 新增 `query`（必填，自由文本，可为空字符串 `""`）
- 校验非法 sourceType 时报错退出

## 5. SKILL.md 引用更新

3 处 register-evidence 调用语法同步更新：

```
旧: echo "..." | node scripts/knowledge-query.js register-evidence <workspaceRoot> "<描述>"
新: echo "..." | node scripts/knowledge-query.js register-evidence <workspaceRoot> "<描述>" <sourceType> "<query>"
```

## 6. subagent-prompt.md 更新

"查到后处理" section 更新调用语法 + 新增 sourceType/query 填写指引：

- sourceType 由子 Agent 根据实际查询来源填写（skill / local / repo / mcp / web）
- query 填写实际使用的查询关键词
- 步骤3 用户反馈场景 sourceType 为 `user`，query 为 `"用户提供"`

## 7. 实施范围

| 做 | 不做 |
|----|------|
| `registerEvidence()` 改参数 + 快照模板 + registry 格式 | 修改 `readEvidence` / `nextEvId` |
| CLI help text + usage 更新 | 修改 hooks.json |
| SKILL.md 3 处引用更新 | 修改 knowledge-sources.json |
| subagent-prompt.md 调用语法更新 | 修改 evidence hooks guard |
| 旧 evidence 格式迁移脚本 | — |

## 8. 不变式

- evidence 存储路径不变（`evidence/knowledge/EV-*.md`）
- hooks 保护范围不变
- 4 步查询流程不变
- stdin 传内容方式不变
