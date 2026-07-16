# knowledge-sources.json Guard 设计

日期：2026-07-15
状态：待评审

## 问题

Session `a8f46916` 记录：Agent 在 `/knowledge-query 修改配置` 时，直接用 Edit 工具修改了 `skills/knowledge-query/knowledge-sources.json`（skill 默认配置），绕过 `knowledge-query.js update-config` CLI，且未在 workspace 创建配置副本。

## 设计

复用现有 guard 模式（与 checklist guard、evidence guard 一致）。

### 保护路径

| 路径 | 策略 |
|------|------|
| `skills/knowledge-query/knowledge-sources.json` | 完全禁止直接 Write/Edit |
| `.devsphere/config/knowledge-sources.json` | 禁止直接 Write/Edit，仅允许通过 CLI |

### 新增 guard 命令（`scripts/knowledge-query.js`）

在已有 CLI switch 中新增两个 guard 子命令，读取 stdin 中的 hook payload，输出 deny decision。格式与 `devsphere-guard.js` guard 函数一致。

**1. `guard-write`** — PreToolUse Write/Edit 拦截

- 从 stdin 读取 `{ tool_input: { file_path } }`
- 匹配 `file_path` 包含 `knowledge-sources.json`
- deny，原因：须通过 `knowledge-query.js` CLI 修改

**2. `guard-bash`** — PreToolUse Bash 拦截

- 从 stdin 读取 `{ tool_input: { command } }`
- 匹配 `command` 包含 `knowledge-sources.json`
- 豁免：`command` 包含 `knowledge-query.js`
- deny（非豁免时）

### hook 注册（`hooks/hooks.json`）

PreToolUse 新增两项：

```json
{"matcher": "Write|Edit", "hooks": [{"type": "command", "command": "... knowledge-query.js guard-write"}]},
{"matcher": "Bash", "hooks": [{"type": "command", "command": "... knowledge-query.js guard-bash"}]}
```

### 影响范围

```
scripts/knowledge-query.js  — +2 CLI case（guard-write, guard-bash）
hooks/hooks.json            — +2 hook 注册
```

不在范围内：devsphere-guard.js、SKILL.md 无需修改。
