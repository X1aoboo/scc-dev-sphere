# Knowledge Query Skill 脚本引用完整化

- **状态:** 已确认
- **日期:** 2026-07-15
- **范围:** `skills/knowledge-query/SKILL.md`、`skills/knowledge-query/subagent-prompt.md`
- **驱动:** 脚本引用缺少完整命令行语法，导致 LLM 执行 skill 时被迫读取脚本文件，增大 token 开销

## 1. 问题

当前 SKILL.md 和 subagent-prompt.md 中对 `scripts/knowledge-query.js` 的引用形式为：

- 泛泛提及 "使用 `scripts/knowledge-query.js`"，不指明具体命令
- 仅写命令名如 `show-config`、`register-evidence`，缺少 `node` 前缀、参数列表

LLM 必须读取脚本源码才能知道完整调用方式，每次执行浪费 token 和 context。

## 2. 方案

将所有脚本引用替换为完整 CLI 调用语法：

```
node scripts/knowledge-query.js <command> <workspaceRoot> [args...]
```

约定 `<workspaceRoot>` 为项目根目录（即 `"${CLAUDE_PLUGIN_ROOT}/.."`），在配置工作流开头说明。

## 3. SKILL.md 变更

### 3.1 配置工作流

**替换 "配置读取/修改/重置 全部通过 `scripts/knowledge-query.js` 确定性执行。"** 为一行说明：

```markdown
配置操作均通过 `node scripts/knowledge-query.js` 执行（`<workspaceRoot>` 为项目根目录，即 `"${CLAUDE_PLUGIN_ROOT}/.."`）。
```

**操作项命令补全**：

| 操作 | 改为 |
|------|------|
| 展示配置 | `node scripts/knowledge-query.js show-config <workspaceRoot>` |
| 添加目录 | `node scripts/knowledge-query.js add-config-item <workspaceRoot> sources.local.dirs /data/docs` |
| 禁用源 | `node scripts/knowledge-query.js update-config <workspaceRoot> sources.mcp.enabled false` |
| 重置 | `node scripts/knowledge-query.js reset-config <workspaceRoot>` |

### 3.2 步骤1

**Before**: `registry 检索由 \`scripts/knowledge-query.js\` 确定性执行。`

**After**: `registry 检索通过 \`node scripts/knowledge-query.js next-ev-id <workspaceRoot>\` 获取最新编号，通过 \`node scripts/knowledge-query.js read-evidence <workspaceRoot> <evId>\` 读取已有快照摘要。`

### 3.3 步骤2

**Before**: `` \`scripts/knowledge-query.js register-evidence\` ``

**After**: `` \`node scripts/knowledge-query.js register-evidence <workspaceRoot> "<描述>" <临时文件路径>\` ``

### 3.4 步骤3

**Before**: `` \`scripts/knowledge-query.js register-evidence\` ``

**After**: `` \`node scripts/knowledge-query.js register-evidence <workspaceRoot> "<描述>" <临时文件路径>\` ``

### 3.5 步骤4

**Before**: `` \`scripts/knowledge-query.js read-evidence\` ``

**After**: `` \`node scripts/knowledge-query.js read-evidence <workspaceRoot> <evId>\` ``

## 4. subagent-prompt.md 变更

### 4.1 配置读取

**Before**: `可通过 \`scripts/knowledge-query.js read-config <workspaceRoot>\` 获取当前生效的数据源配置（脚本自动处理两层 fallback）。`

**After**: `当前生效的数据源配置由主流程注入，无需自行读取。如需获取，可通过 \`node scripts/knowledge-query.js read-config <workspaceRoot>\` 获取。`

### 4.2 查到后处理

**Before**: `调用 \`node scripts/knowledge-query.js register-evidence <workspaceRoot> "<主题描述>" <临时文件路径>\``

**After**: 已完整，无需修改。

## 5. 实施范围

| 做 | 不做 |
|----|------|
| SKILL.md 中所有脚本引用改为完整命令行 | 修改脚本本身 |
| subagent-prompt.md 中配置读取改为完整命令行 | 修改 hooks.json |
| 在配置工作流开头补充 `<workspaceRoot>` 说明 | 修改其他 skill 中的引用 |

## 6. 不变式

- 脚本接口不变
- 工作流逻辑不变
- hooks 行为不变
- evidence 格式不变
