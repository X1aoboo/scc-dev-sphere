# knowledge-sources.json Guard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 添加 guard 机制，禁止 Agent 直接 Write/Edit `knowledge-sources.json`（包括 skill 默认配置和 workspace 配置），强制通过 `knowledge-query.js` CLI 修改。

**Architecture:** 在 `knowledge-query.js` 新增 `guard-write` / `guard-bash` 两个 CLI 子命令，从 stdin 读取 hook payload，匹配 `knowledge-sources.json` 路径后输出 deny decision。在 `hooks.json` 注册两个 PreToolUse hook。

**Tech Stack:** Node.js 内置 `fs`, `path`。无外部依赖。

## Global Constraints

- skill 默认配置 (`skills/knowledge-query/knowledge-sources.json`) 完全禁止直接 Write/Edit
- workspace 配置 (`.devsphere/config/knowledge-sources.json`) 禁止直接 Write/Edit，仅允许通过 `knowledge-query.js` CLI
- Bash guard 豁免 `knowledge-query.js` 命令行
- guard 逻辑统一放在 `knowledge-query.js`，不修改 `devsphere-guard.js`

---

### Task 1: knowledge-query.js 新增 guard-write / guard-bash CLI 命令

**Files:**
- Modify: `scripts/knowledge-query.js`

**Interfaces:**
- Produces: CLI 子命令 `guard-write` 和 `guard-bash`，从 stdin 读取 hook payload，输出 deny decision 到 stdout

- [ ] **Step 1: 添加 guard 辅助函数**

在 `main()` 函数之前（line 301 之前），新增两个函数：

```javascript
// --- Guard helpers ---

function knowledgeSourcesPath(filePath) {
  const norm = (filePath || '').replace(/\\/g, '/');
  if (/(?:^|\/)knowledge-sources\.json$/.test(norm)) return 'knowledge-sources.json';
  return null;
}

function guardWrite(stdinJson) {
  const filePath = stdinJson && stdinJson.tool_input && stdinJson.tool_input.file_path;
  const target = knowledgeSourcesPath(filePath);
  if (!target) return null;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `${target} 禁止直接 Write/Edit。数据源配置须通过 knowledge-query.js CLI（update-config / add-config-item / remove-config-item / reset-config）修改。`,
    },
  };
}

function guardBash(stdinJson) {
  const ti = stdinJson && stdinJson.tool_input;
  if (!ti || typeof ti.command !== 'string') return null;
  const command = ti.command;
  const targetsConfig = /knowledge-sources\.json/.test(command);
  if (!targetsConfig) return null;
  const isCLI = command.includes('knowledge-query.js');
  if (isCLI) return null;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: 'knowledge-sources.json 禁止通过 Bash 直接操作；数据源配置须通过 knowledge-query.js CLI 修改。',
    },
  };
}
```

- [ ] **Step 2: 在 CLI switch 中新增两个 case**

在 `main()` 的 `switch (command)` 中，`default` case 之前，新增：

```javascript
      case 'guard-write': {
        let stdinJson = null;
        try { stdinJson = JSON.parse(fs.readFileSync(0, 'utf-8')); }
        catch (e) { process.exit(0); }
        const decision = guardWrite(stdinJson);
        if (decision) process.stdout.write(JSON.stringify(decision));
        process.exit(0);
        break;
      }
      case 'guard-bash': {
        let stdinJson = null;
        try { stdinJson = JSON.parse(fs.readFileSync(0, 'utf-8')); }
        catch (e) { process.exit(0); }
        const decision = guardBash(stdinJson);
        if (decision) process.stdout.write(JSON.stringify(decision));
        process.exit(0);
        break;
      }
```

- [ ] **Step 3: 添加导出**

在 `module.exports` 末尾添加：

```javascript
  guardWrite,
  guardBash,
```

- [ ] **Step 4: 验证已有命令不受影响**

```bash
node scripts/knowledge-query.js read-config
```
Expected: 输出默认配置 JSON

- [ ] **Step 5: 手动测试 guard-write（模拟 hook 调用）**

```bash
echo '{"tool_input":{"file_path":"skills/knowledge-query/knowledge-sources.json"}}' | node scripts/knowledge-query.js guard-write
```
Expected: 输出包含 `"permissionDecision":"deny"` 的 JSON

- [ ] **Step 6: 手动测试 guard-write 不匹配时静默**

```bash
echo '{"tool_input":{"file_path":"some/other/file.md"}}' | node scripts/knowledge-query.js guard-write
```
Expected: 无输出，exit 0

- [ ] **Step 7: 手动测试 guard-bash（非 CLI 操作被拦截）**

```bash
echo '{"tool_input":{"command":"cat knowledge-sources.json"}}' | node scripts/knowledge-query.js guard-bash
```
Expected: 输出 `"permissionDecision":"deny"`

- [ ] **Step 8: 手动测试 guard-bash（CLI 操作豁免）**

```bash
echo '{"tool_input":{"command":"node scripts/knowledge-query.js update-config sources.web.enabled true"}}' | node scripts/knowledge-query.js guard-bash
```
Expected: 无输出，exit 0（CLI 豁免）

- [ ] **Step 9: 运行全量测试确认无回归**

```bash
for f in scripts/test/*.test.js; do node "$f" 2>&1 | grep -E "^(ℹ tests|✗ FAIL)"; done
```
Expected: 全部 pass，0 fail

- [ ] **Step 10: Commit**

```bash
git add scripts/knowledge-query.js
git commit -m "feat: add guard-write and guard-bash CLI commands to knowledge-query.js"
```

---

### Task 2: hooks.json 注册两个 PreToolUse hook

**Files:**
- Modify: `hooks/hooks.json`

**Interfaces:**
- Consumes: `knowledge-query.js guard-write` / `guard-bash` CLI（Task 1）

- [ ] **Step 1: 在 PreToolUse 末尾新增 guard-write hook**

在 `hooks.json` 的 `PreToolUse` 数组末尾（最后一个 `check-clarify-checklist` hook 之后），新增：

```json
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/scripts/knowledge-query.js\" guard-write"
          }
        ]
      }
```

- [ ] **Step 2: 新增 guard-bash hook**

紧接上一项之后：

```json
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/scripts/knowledge-query.js\" guard-bash"
          }
        ]
      }
```

- [ ] **Step 3: 验证 JSON 合法**

```bash
node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf8')); console.log('OK')"
```
Expected: `OK`

- [ ] **Step 4: 运行全量测试**

```bash
for f in scripts/test/*.test.js; do node "$f" 2>&1 | grep -E "^(ℹ tests|✗ FAIL)"; done
```
Expected: 全部 pass

- [ ] **Step 5: Commit**

```bash
git add hooks/hooks.json
git commit -m "feat: register knowledge-sources.json guard hooks in PreToolUse"
```
