# knowledge-query.js 显式 workspaceRoot 设计

日期：2026-07-15
状态：待评审

## 问题

Session `51892060` 分析：`knowledge-query.js` CLI 使用 `process.cwd()` 作为 `workspaceRoot`。会话 CWD 是 `test_project`，导致配置写入到 `test_project/.devsphere/config/` 而非 `scc-dev-sphere/.devsphere/config/`。Agent 被迫手动 `cd` 切换目录。

## 设计

### CLI 接口变更

原命令行格式：
```
knowledge-query.js <command> [args...]
```

新命令行格式：
```
knowledge-query.js <command> <workspaceRoot> [args...]
```

`workspaceRoot` 为必选的第一位置参数。为空时 fallback `process.cwd()`。

### 受影响命令

所有业务命令（`read-config`, `show-config`, `update-config`, `add-config-item`, `remove-config-item`, `reset-config`, `next-ev-id`, `register-evidence`, `read-evidence`）：

```
# 旧
knowledge-query.js show-config
knowledge-query.js update-config sources.web.enabled true

# 新
knowledge-query.js show-config ${CLAUDE_PROJECT_DIR}
knowledge-query.js update-config ${CLAUDE_PROJECT_DIR} sources.web.enabled true
```

Guard 命令（`guard-write`, `guard-bash`）不消费 workspaceRoot，不变。

### 对接方

| 文件 | 变更 |
|------|------|
| `scripts/knowledge-query.js` | `main()` 从 `args[1]` 取 `workspaceRoot`，原 `args[1]...` 后移一位 |
| `skills/knowledge-query/SKILL.md` | 所有 CLI 示例加 `${CLAUDE_PROJECT_DIR}` |
| `skills/knowledge-query/subagent-prompt.md` | `read-config` 命令加 `${CLAUDE_PROJECT_DIR}` |
| `hooks/hooks.json` | 不变（guard 不依赖 workspaceRoot） |
