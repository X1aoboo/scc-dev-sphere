# knowledge-query.js 显式 workspaceRoot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `knowledge-query.js` CLI 从 `process.cwd()` 改为接受显式 `workspaceRoot` 参数，对接 `${CLAUDE_PROJECT_DIR}`。

**Architecture:** `main()` 中 `workspaceRoot` 从第一个位置参数取（`args[1]`），为空时 fallback `process.cwd()`。原 `args[1]...` 业务参数整体后移一位。Guard 命令不受影响。

**Tech Stack:** Node.js 内置 `fs`, `path`。

## Global Constraints

- `workspaceRoot` 为 `args[1]`，为空时 fallback `process.cwd()`
- Guard 命令（`guard-write`, `guard-bash`）不消费 `workspaceRoot`
- SKILL.md / subagent-prompt.md 所有 CLI 示例加 `${CLAUDE_PROJECT_DIR}`
- hooks.json 不变

---

### Task 1: knowledge-query.js CLI arg 解析变更

**Files:**
- Modify: `scripts/knowledge-query.js:341-344, 376-380, 388-392`

**Interfaces:**
- Produces: `main()` 中 `workspaceRoot` 从 `args[1]` 取；所有 switch case 中 `args[1]`→`args[2]`, `args[2]`→`args[3]`, `args[3]`→`args[4]`

- [ ] **Step 1: 修改 main() 中 workspaceRoot 取值**

将 line 344：
```javascript
  const workspaceRoot = process.cwd();
```
改为：
```javascript
  const workspaceRoot = args[1] || process.cwd();
```

- [ ] **Step 2: 更新 usage 文本**

将 line 347 `'Usage: knowledge-query.js <command> [args...]'` 改为：
```javascript
    console.error('Usage: knowledge-query.js <command> <workspaceRoot> [args...]');
```

- [ ] **Step 3: 业务命令参数后移**

以下 switch case 中 `args[1]` → `args[2]`, `args[2]` → `args[3]`, `args[3]` → `args[4]`：

```javascript
      case 'update-config':
        result = updateConfig(workspaceRoot, args[2], args[3]);  // was args[1], args[2]
        break;
      case 'add-config-item':
        result = addConfigItem(workspaceRoot, args[2], args[3]);  // was args[1], args[2]
        break;
      case 'remove-config-item':
        result = removeConfigItem(workspaceRoot, args[2], args[3]);  // was args[1], args[2]
        break;
      case 'register-evidence':
        result = registerEvidence(workspaceRoot, args[2], args[3], args[4]);  // was args[1], args[2], args[3]
        break;
      case 'read-evidence':
        result = readEvidence(workspaceRoot, args[2]);  // was args[1]
        break;
```

以下 case 不需要参数偏移（只消费 workspaceRoot）：`read-config`, `show-config`, `reset-config`, `next-ev-id`, `guard-write`, `guard-bash`。

- [ ] **Step 4: 验证命名参数解析正确**

```bash
# 测试 workspaceRoot 显式传入
node scripts/knowledge-query.js read-config /Users/xiaobo/Documents/Projects/scc-dev-sphere
```
Expected: 输出当前生效配置 JSON

- [ ] **Step 5: 验证 fallback 仍然可用**

```bash
node scripts/knowledge-query.js read-config
```
Expected: 输出以 CWD 为 workspaceRoot 的配置 JSON（兼容旧用法）

- [ ] **Step 6: 验证 guard 不受影响**

```bash
echo '{"tool_input":{"file_path":"skills/knowledge-query/knowledge-sources.json"}}' | node scripts/knowledge-query.js guard-write
```
Expected: deny JSON（Guard 仍正常工作）

- [ ] **Step 7: 运行全量测试**

```bash
for f in scripts/test/*.test.js; do node "$f" 2>&1 | grep -E "^(ℹ tests|✗ FAIL)"; done
```
Expected: 全部 pass，0 fail

- [ ] **Step 8: Commit**

```bash
git add scripts/knowledge-query.js
git commit -m "fix: accept explicit workspaceRoot as first positional arg in knowledge-query.js CLI"
```

---

### Task 2: SKILL.md 和 subagent-prompt.md CLI 示例更新

**Files:**
- Modify: `skills/knowledge-query/SKILL.md`
- Modify: `skills/knowledge-query/subagent-prompt.md`

**Interfaces:**
- Consumes: CLI 新签名（Task 1）

- [ ] **Step 1: 更新 SKILL.md CLI 示例**

将以下位置的 `node scripts/knowledge-query.js <command>` 改为 `node scripts/knowledge-query.js <command> ${CLAUDE_PROJECT_DIR}`：

| 行 | 原命令 | 新命令 |
|----|--------|--------|
| 49 | `show-config` | `show-config ${CLAUDE_PROJECT_DIR}` |
| 50 | `add-config-item sources.local.dirs /data/docs` | `add-config-item ${CLAUDE_PROJECT_DIR} sources.local.dirs /data/docs` |
| 51 | `update-config sources.mcp.enabled false` | `update-config ${CLAUDE_PROJECT_DIR} sources.mcp.enabled false` |
| 52 | `reset-config` | `reset-config ${CLAUDE_PROJECT_DIR}` |
| 60 | `next-ev-id` | `next-ev-id ${CLAUDE_PROJECT_DIR}` |
| 60 | `read-evidence <evId>` | `read-evidence ${CLAUDE_PROJECT_DIR} <evId>` |
| 69 | `register-evidence "<描述>" <sourceType> "<query>"` | `register-evidence ${CLAUDE_PROJECT_DIR} "<描述>" <sourceType> "<query>"` |
| 80 | `register-evidence "<描述>" user "用户提供"` | `register-evidence ${CLAUDE_PROJECT_DIR} "<描述>" user "用户提供"` |
| 85 | `read-evidence <evId>` | `read-evidence ${CLAUDE_PROJECT_DIR} <evId>` |

- [ ] **Step 2: 更新 subagent-prompt.md CLI 示例**

| 行 | 原命令 | 新命令 |
|----|--------|--------|
| 16 | `read-config` | `read-config ${CLAUDE_PROJECT_DIR}` |
| 23 | `register-evidence "<主题描述>" <sourceType> "<query>"` | `register-evidence ${CLAUDE_PROJECT_DIR} "<主题描述>" <sourceType> "<query>"` |

- [ ] **Step 3: 验证 skill-contracts 测试**

```bash
node scripts/test/skill-contracts.test.js
```
Expected: 全部 pass（skill-contracts 测试匹配 SKILL.md 中的模式，需要确认新格式仍匹配）

- [ ] **Step 4: 运行全量测试**

```bash
for f in scripts/test/*.test.js; do node "$f" 2>&1 | grep -E "^(ℹ tests|✗ FAIL)"; done
```
Expected: 全部 pass

- [ ] **Step 5: Commit**

```bash
git add skills/knowledge-query/SKILL.md skills/knowledge-query/subagent-prompt.md
git commit -m "fix: add explicit workspaceRoot to all CLI examples in knowledge-query skill docs"
```
