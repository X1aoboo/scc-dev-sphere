# Evidence 快照 Hook 防护

- **状态:** 已确认
- **日期:** 2026-07-15
- **范围:** `scripts/devsphere-guard.js`（新增 2 个 guard）、`hooks/hooks.json`（新增 2 条 hook）
- **驱动:** 防止 evidence 快照文件和注册表被直接篡改，保证信源完整性

## 1. 目标

为 evidence 快照文件（`evidence/knowledge/EV-*.md`）和注册表（`evidence/evidence-registry.json`）添加 PreToolUse hook 防护，禁止通过 Write/Edit/Bash 直接修改，仅允许通过 `scripts/knowledge-query.js` 脚本操作。

## 2. 保护范围

| 文件 | 路径模式 | 保护原因 |
|------|---------|---------|
| 快照文件 | `evidence/knowledge/EV-*.md` | 真实信源，不可篡改 |
| 注册表 | `evidence/evidence-registry.json` | 证据索引，需与快照一致 |

## 3. 防护策略

**模式 B — 允许脚本追加（不可直接修改）**：
- 拒绝所有直接 Write/Edit/Bash 对 evidence 文件的修改
- 仅 `scripts/knowledge-query.js` 可通过 Bash 写入（豁免 `knowledge-query.js` 命令）
- 如需补充 → 注册新 EV-ID；如需通过脚本追加 → `register-evidence` 命令

## 4. 新增 Guard

### 4.1 `check-evidence-writes`（PreToolUse Write|Edit）

**逻辑**：
1. 提取 `file_path` 从 `tool_input`
2. 匹配路径模式：`evidence/knowledge/` 或 `evidence/evidence-registry.json`
3. 命中 → 返回 deny decision
4. 未命中 → 返回 null（放行）

**deny decision 格式**（与现有 guard 一致）：
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Evidence files must be modified through scripts/knowledge-query.js, not direct Write/Edit."
  }
}
```

### 4.2 `check-evidence-bash`（PreToolUse Bash）

**逻辑**：
1. 提取 `command` 从 `tool_input`
2. 检查是否包含 evidence 路径模式
3. 不包含 → 返回 null（放行）
4. 包含 → 检查是否含 `knowledge-query.js`
5. 含 `knowledge-query.js` → 返回 null（放行，脚本豁免）
6. 不含 → 返回 deny decision

**deny reason**: "Evidence files must be modified through scripts/knowledge-query.js."

## 5. 实现模式

完全遵循现有 guard 模式（`check-review-writes` + `check-review-bash`）：

```javascript
// 逻辑函数
function checkEvidenceWritesFromStdin(stdinJson) {
  const toolName = stdinJson?.tool_input?.tool_name;
  const filePath = stdinJson?.tool_input?.file_path;
  if (toolName !== 'Write' && toolName !== 'Edit') return null;
  if (!filePath) return null;
  
  const isEvidenceFile = 
    filePath.includes('/evidence/knowledge/EV-') ||
    filePath.includes('/evidence/evidence-registry.json');
  
  if (!isEvidenceFile) return null;
  
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: 'Evidence files must be modified through scripts/knowledge-query.js, not direct Write/Edit.',
    },
  };
}

function checkEvidenceBashFromStdin(stdinJson) {
  const command = stdinJson?.tool_input?.command;
  if (!command) return null;
  
  const targetsEvidence = 
    command.includes('evidence/knowledge/') ||
    command.includes('evidence/evidence-registry.json');
  
  if (!targetsEvidence) return null;
  if (command.includes('knowledge-query.js')) return null; // 脚本豁免
  
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: 'Evidence files must be modified through scripts/knowledge-query.js.',
    },
  };
}
```

## 6. hooks.json 变更

在 `PreToolUse` 事件下新增 2 条 hook：

```json
{
  "matcher": "Write|Edit",
  "hooks": [
    {
      "type": "command",
      "command": "\"${CLAUDE_PLUGIN_ROOT}/scripts/devsphere-guard.js\" check-evidence-writes"
    }
  ]
},
{
  "matcher": "Bash",
  "hooks": [
    {
      "type": "command",
      "command": "\"${CLAUDE_PLUGIN_ROOT}/scripts/devsphere-guard.js\" check-evidence-bash"
    }
  ]
}
```

## 7. CLI 入口新增 case

```javascript
case 'check-evidence-writes': {
  let stdinJson = null;
  try { stdinJson = JSON.parse(fs.readFileSync(0, 'utf-8')); }
  catch (e) { process.exit(0); }
  const decision = checkEvidenceWritesFromStdin(stdinJson);
  if (decision) { process.stdout.write(JSON.stringify(decision)); }
  process.exit(0);
}
case 'check-evidence-bash': {
  let stdinJson = null;
  try { stdinJson = JSON.parse(fs.readFileSync(0, 'utf-8')); }
  catch (e) { process.exit(0); }
  const decision = checkEvidenceBashFromStdin(stdinJson);
  if (decision) { process.stdout.write(JSON.stringify(decision)); }
  process.exit(0);
}
```

## 8. 实施范围

| 做 | 不做 |
|----|------|
| `devsphere-guard.js` 新增 2 个 guard 函数 | 新增 `append-evidence` 脚本命令 |
| `devsphere-guard.js` 新增 2 个 CLI case | 修改 `knowledge-query.js` |
| `hooks/hooks.json` 新增 2 条 PreToolUse hook | 修改现有 guard 逻辑 |
| 导出新函数到 `module.exports` | 修改 agent/skill 文案 |

## 9. 不变式

- 现有 guard 行为不变
- evidence 归档格式不变
- `register-evidence` 调用方式不变
- 所有 PreToolUse guard 的 fail-open 策略不变（解析异常 → exit 0）
