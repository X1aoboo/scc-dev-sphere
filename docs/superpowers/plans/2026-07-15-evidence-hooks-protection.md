# Evidence 快照 Hook 防护 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 evidence/knowledge/EV-*.md 快照和 evidence-registry.json 注册表添加 PreToolUse hook 防护，禁止直接 Write/Edit/Bash 修改，仅允许 scripts/knowledge-query.js。

**Architecture:** 在 devsphere-guard.js 新增 2 个 PreToolUse guard（check-evidence-writes + check-evidence-bash），遵循现有 check-review-writes + check-review-bash 模式。hooks.json 新增 2 条对应 hook entry。

**Tech Stack:** Node.js（fs, path），无外部依赖。

## Global Constraints

- 遵循现有 guard 模式：逻辑函数 → stdin 解析 → CLI case → 导出
- fail-open：stdin 解析异常 → exit 0 不阻塞
- deny 决策通过 stdout JSON 输出，exit 0
- evidence 归档格式不变
- 现有 guard 行为不变
- hooks.json 路径使用 `${CLAUDE_PLUGIN_ROOT}` 变量

---

### Task 1: 新增 evidence guard 函数 + hooks 注册

**Files:**
- Modify: `scripts/devsphere-guard.js`（新增 ~70 行）
- Modify: `hooks/hooks.json`（新增 2 条 PreToolUse entry）

**Interfaces:**
- Consumes: 无
- Produces:
  - `checkEvidenceWritesFromStdin(stdinJson)` → `null` | deny decision object
  - `checkEvidenceBashFromStdin(stdinJson)` → `null` | deny decision object
  - CLI commands: `check-evidence-writes`, `check-evidence-bash`

- [ ] **Step 1: 在 devsphere-guard.js 中新增 guard 逻辑函数**

在 `checkReviewWritesFromStdin` 之后（约第 224 行之后）插入：

```javascript
// --- Evidence guards ---

function checkEvidenceWritesFromStdin(stdinJson) {
  const ti = stdinJson && stdinJson.tool_input;
  if (!ti) return null;
  const toolName = ti.tool_name;
  if (toolName !== 'Write' && toolName !== 'Edit') return null;
  const filePath = ti.file_path;
  if (!filePath) return null;

  const norm = (filePath || '').replace(/\\/g, '/');
  const isEvidenceFile =
    norm.includes('/evidence/knowledge/EV-') ||
    norm.endsWith('/evidence/evidence-registry.json');

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
  const ti = stdinJson && stdinJson.tool_input;
  if (!ti || typeof ti.command !== 'string') return null;
  const command = ti.command;

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

- [ ] **Step 2: 在 main() switch 中新增 2 个 CLI case**

在 `case 'check-review-bash':` 之后（约第 418 行），`default:` 之前插入：

```javascript
      case 'check-evidence-writes': {
        let stdinJson = null;
        try { stdinJson = JSON.parse(fs.readFileSync(0, 'utf-8')); }
        catch (e) { process.exit(0); }
        const decision = checkEvidenceWritesFromStdin(stdinJson);
        if (decision) process.stdout.write(JSON.stringify(decision));
        process.exit(0);
        break;
      }
      case 'check-evidence-bash': {
        let stdinJson = null;
        try { stdinJson = JSON.parse(fs.readFileSync(0, 'utf-8')); }
        catch (e) { process.exit(0); }
        const decision = checkEvidenceBashFromStdin(stdinJson);
        if (decision) process.stdout.write(JSON.stringify(decision));
        process.exit(0);
        break;
      }
```

- [ ] **Step 3: 在 module.exports 中新增导出**

在 `module.exports` 对象末尾（`checkReviewBashFromStdin,` 之后）添加：

```javascript
  checkEvidenceWritesFromStdin,
  checkEvidenceBashFromStdin,
```

- [ ] **Step 4: 验证脚本语法和导出**

```bash
node -e "const m = require('./scripts/devsphere-guard'); console.log(Object.keys(m).filter(k => k.includes('Evidence')))"
```

Expected: `[ 'checkEvidenceWritesFromStdin', 'checkEvidenceBashFromStdin' ]`

- [ ] **Step 5: 模拟测试 check-evidence-writes**

```bash
# 正常文件放行
echo '{"tool_input":{"tool_name":"Write","file_path":"/tmp/test.md"}}' | node scripts/devsphere-guard.js check-evidence-writes
echo "exit: $?"
```

Expected: exit 0，无 stdout 输出（放行）

```bash
# evidence 快照拒绝
echo '{"tool_input":{"tool_name":"Write","file_path":"/workspace/evidence/knowledge/EV-001-test.md"}}' | node scripts/devsphere-guard.js check-evidence-writes
```

Expected: stdout 输出 JSON 含 `permissionDecision: "deny"`，exit 0

```bash
# evidence registry 拒绝
echo '{"tool_input":{"tool_name":"Edit","file_path":"/workspace/evidence/evidence-registry.json"}}' | node scripts/devsphere-guard.js check-evidence-writes
```

Expected: stdout 输出 JSON 含 `permissionDecision: "deny"`，exit 0

- [ ] **Step 6: 模拟测试 check-evidence-bash**

```bash
# 普通命令放行
echo '{"tool_input":{"command":"ls /tmp"}}' | node scripts/devsphere-guard.js check-evidence-bash
echo "exit: $?"
```

Expected: exit 0，无 stdout 输出

```bash
# 直接操作 evidence 拒绝
echo '{"tool_input":{"command":"cat evidence/knowledge/EV-001.md > /dev/null"}}' | node scripts/devsphere-guard.js check-evidence-bash
```

Expected: stdout 输出 JSON 含 `permissionDecision: "deny"`，exit 0

```bash
# knowledge-query.js 豁免
echo '{"tool_input":{"command":"node scripts/knowledge-query.js register-evidence /ws \"test\" /tmp/out.md"}}' | node scripts/devsphere-guard.js check-evidence-bash
```

Expected: exit 0，无 stdout 输出（脚本豁免放行）

- [ ] **Step 7: 在 hooks.json 新增 2 条 PreToolUse entry**

在 `hooks.json` 的 `"PreToolUse"` 数组中，最后一个现有 entry（`check-review-bash`）之后添加：

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

注意在 `check-review-bash` entry 的 `}` 之后加逗号。

- [ ] **Step 8: 验证 hooks.json 是合法 JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf-8')); console.log('valid')"
```

Expected: `valid`

- [ ] **Step 9: 确认无意外变更**

```bash
git diff --stat
```

Expected: 仅 `scripts/devsphere-guard.js` 和 `hooks/hooks.json` 有变更。

- [ ] **Step 10: Commit**

```bash
git add scripts/devsphere-guard.js hooks/hooks.json
git commit -m "feat(guard): add evidence file write protection hooks

- check-evidence-writes: deny direct Write/Edit to EV snapshots and registry
- check-evidence-bash: deny Bash ops on evidence files (knowledge-query.js exempt)
- Register both as PreToolUse hooks in hooks.json"
```

---

### 自审

| 检查项 | 结果 |
|--------|------|
| Spec 覆盖 | 2 个 guard 函数 + 2 个 CLI case + 2 条 hooks.json entry + 2 个导出 — 对应 spec §4/§6/§7 |
| 占位符扫描 | 无 TBD/TODO/占位符 |
| 类型一致性 | CLI case 名 `check-evidence-writes`/`check-evidence-bash` 与 hooks.json command 一致 |
| 现有 guard 不受影响 | 仅在 module.exports 和 switch 中追加，不修改任何现有代码 |
